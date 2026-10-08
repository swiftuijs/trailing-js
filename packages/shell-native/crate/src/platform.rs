//! OS readiness and child ownership. Unix never replaces Node's SIGCHLD handler;
//! Windows never puts blocking anonymous-pipe reads on a worker pool.
#[cfg(target_os = "macos")]
use std::os::fd::AsRawFd;
#[cfg(unix)]
use std::os::fd::{FromRawFd, OwnedFd};
use std::{
    io,
    process::{Command, ExitStatus, Stdio},
};
#[cfg(windows)]
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};
#[cfg(unix)]
use tokio::{io::unix::AsyncFd, net::unix::pipe};

#[cfg(unix)]
pub type ReadPipe = pipe::Receiver;
#[cfg(unix)]
pub type WritePipe = pipe::Sender;
#[cfg(windows)]
pub type ReadPipe = NamedPipeServer;
#[cfg(windows)]
pub type WritePipe = NamedPipeServer;

pub struct Pipes {
    pub stdin: Stdio,
    pub stdout: Stdio,
    pub stderr: Stdio,
    pub input: Option<WritePipe>,
    pub output: Option<ReadPipe>,
    pub error: Option<ReadPipe>,
}
#[cfg(windows)]
pub fn executable(options: &crate::process::Options) -> io::Result<std::ffi::OsString> {
    use std::path::PathBuf;
    let cwd = options
        .cwd
        .as_ref()
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(std::env::current_dir)?;
    let file = &options.executable;
    let name = file.rsplit(['\\', '/', ':']).next().unwrap_or(file);
    let extension = name.find('.').is_some_and(|dot| dot + 1 < name.len());
    let mut directories = vec![cwd.clone()];
    if !file.contains(['\\', '/', ':']) {
        let path = options
            .environment
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case("PATH"))
            .map(|(_, value)| value.as_str())
            .unwrap_or("");
        let mut remaining = path;
        while !remaining.is_empty() {
            // Match libuv: a quoted entry can contain semicolons, and relative
            // entries resolve from child cwd. No implicit System32/application
            // directory fallback, PATHEXT expansion or command interpreter.
            let quoted = remaining.starts_with(['\'', '"']);
            let after_quote = if quoted {
                remaining[1..]
                    .find(remaining.as_bytes()[0] as char)
                    .map(|n| n + 2)
                    .unwrap_or(remaining.len())
            } else {
                0
            };
            let end = remaining[after_quote..]
                .find(';')
                .map(|n| n + after_quote)
                .unwrap_or(remaining.len());
            let mut entry = &remaining[..end];
            if entry.starts_with(['\'', '"']) {
                entry = &entry[1..];
            }
            if entry.ends_with(['\'', '"']) {
                entry = &entry[..entry.len() - 1];
            }
            if !entry.is_empty() {
                directories.push(cwd.join(entry));
            }
            remaining = if end == remaining.len() {
                ""
            } else {
                &remaining[end + 1..]
            };
        }
    }
    for directory in directories {
        for suffix in if extension {
            &["", ".com", ".exe"][..]
        } else {
            &[".com", ".exe"][..]
        } {
            let mut candidate = directory.join(file).into_os_string();
            candidate.push(suffix);
            if std::path::Path::new(&candidate).is_file() {
                return Ok(candidate);
            }
        }
    }
    Err(io::ErrorKind::NotFound.into())
}
pub fn inherited(index: usize) -> io::Result<Stdio> {
    #[cfg(unix)]
    {
        // SAFETY: fcntl validates the possibly closed parent descriptor and
        // clones it without changing it. Keep new descriptors above stdio, even
        // if another standard descriptor was closed. dup2 in the child removes
        // Node's FD_CLOEXEC flag from the child's standard descriptor.
        let fd = unsafe { libc::fcntl(index as i32, libc::F_DUPFD_CLOEXEC, 3) };
        if fd == -1 {
            return Err(io::Error::last_os_error());
        }
        Ok(Stdio::from(unsafe { OwnedFd::from_raw_fd(fd) }))
    }
    #[cfg(windows)]
    {
        use std::os::windows::io::{FromRawHandle, OwnedHandle};
        use windows_sys::Win32::{
            Foundation::{DuplicateHandle, DUPLICATE_SAME_ACCESS, INVALID_HANDLE_VALUE},
            System::{
                Console::{GetStdHandle, STD_ERROR_HANDLE, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE},
                Threading::GetCurrentProcess,
            },
        };
        // SAFETY: Validate the borrowed standard handle before cloning it.
        let handle =
            unsafe { GetStdHandle([STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, STD_ERROR_HANDLE][index]) };
        if handle.is_null() || handle == INVALID_HANDLE_VALUE {
            return Err(io::Error::last_os_error());
        }
        let mut copy = std::ptr::null_mut();
        // SAFETY: DuplicateHandle validates a possibly stale/closed raw standard
        // handle; only a successful duplication becomes a Rust-owned handle.
        let copied = unsafe {
            let process = GetCurrentProcess();
            DuplicateHandle(
                process,
                handle,
                process,
                &mut copy,
                0,
                0,
                DUPLICATE_SAME_ACCESS,
            )
        };
        if copied == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(Stdio::from(unsafe { OwnedHandle::from_raw_handle(copy) }))
    }
}
#[cfg(unix)]
async fn output_pipe() -> io::Result<(Stdio, ReadPipe)> {
    let (writer, reader) = pipe::pipe()?;
    Ok((Stdio::from(writer.into_blocking_fd()?), reader))
}
#[cfg(unix)]
async fn input_pipe() -> io::Result<(Stdio, WritePipe)> {
    let (writer, reader) = pipe::pipe()?;
    Ok((Stdio::from(reader.into_blocking_fd()?), writer))
}
#[cfg(windows)]
fn named_pipe(read: bool) -> io::Result<(Stdio, NamedPipeServer)> {
    use std::fs::OpenOptions;
    use windows_sys::Win32::Security::Cryptography::{
        BCryptGenRandom, BCRYPT_USE_SYSTEM_PREFERRED_RNG,
    };
    let mut bytes = [0_u8; 16];
    // SAFETY: The system RNG writes exactly this live 16-byte buffer. An
    // unpredictable local name and first-instance creation prevent preconnection.
    let status = unsafe {
        BCryptGenRandom(
            std::ptr::null_mut(),
            bytes.as_mut_ptr(),
            bytes.len() as u32,
            BCRYPT_USE_SYSTEM_PREFERRED_RNG,
        )
    };
    if status < 0 {
        return Err(io::Error::other(
            "Native pipe random-name generation failed",
        ));
    }
    let name = format!(
        "\\\\.\\pipe\\twill-{}-{}",
        std::process::id(),
        bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    );
    // Restrict the local named pipe to its owner and SYSTEM. Default Windows
    // pipe ACLs can grant other local accounts read access; a random name alone
    // is not an access boundary for stdin data.
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::{
            Authorization::ConvertStringSecurityDescriptorToSecurityDescriptorW,
            SECURITY_ATTRIBUTES,
        },
    };
    struct Descriptor(*mut std::ffi::c_void);
    impl Drop for Descriptor {
        fn drop(&mut self) {
            // SAFETY: ConvertStringSecurityDescriptor allocates via LocalAlloc.
            unsafe {
                LocalFree(self.0);
            }
        }
    }
    let sddl: Vec<u16> = "D:P(A;;GA;;;OW)(A;;GA;;;SY)\0".encode_utf16().collect();
    let mut descriptor = std::ptr::null_mut();
    // SAFETY: The null-terminated SDDL and output pointer are live for the call.
    if unsafe {
        ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            1,
            &mut descriptor,
            std::ptr::null_mut(),
        )
    } == 0
    {
        return Err(io::Error::last_os_error());
    }
    let descriptor = Descriptor(descriptor);
    let mut attributes = SECURITY_ATTRIBUTES {
        nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: descriptor.0,
        bInheritHandle: 0,
    };
    let mut options = ServerOptions::new();
    options
        .first_pipe_instance(true)
        .max_instances(1)
        .access_inbound(read)
        .access_outbound(!read)
        .reject_remote_clients(true)
        .in_buffer_size(64 * 1024)
        .out_buffer_size(64 * 1024);
    // SAFETY: Attributes and descriptor remain live through synchronous creation.
    let server = unsafe {
        options.create_with_security_attributes_raw(
            &name,
            (&mut attributes as *mut SECURITY_ATTRIBUTES).cast(),
        )
    }?;
    let file = OpenOptions::new().read(!read).write(read).open(&name)?;
    Ok((Stdio::from(file), server))
}
#[cfg(windows)]
async fn output_pipe() -> io::Result<(Stdio, ReadPipe)> {
    let (stdio, pipe) = named_pipe(true)?;
    pipe.connect().await?;
    Ok((stdio, pipe))
}
#[cfg(windows)]
async fn input_pipe() -> io::Result<(Stdio, WritePipe)> {
    let (stdio, pipe) = named_pipe(false)?;
    pipe.connect().await?;
    Ok((stdio, pipe))
}
async fn output_descriptor(
    capture: bool,
    discard: bool,
    index: usize,
) -> io::Result<(Stdio, Option<ReadPipe>)> {
    if capture {
        let (stdio, pipe) = output_pipe().await?;
        Ok((stdio, Some(pipe)))
    } else {
        Ok((
            if discard {
                Stdio::null()
            } else {
                inherited(index)?
            },
            None,
        ))
    }
}
pub async fn pipes(options: &mut crate::process::Options) -> io::Result<Pipes> {
    let input = options.input.is_some();
    let inherit_input = options.inherit_input;
    let capture_output = options.output_limit.is_some();
    let discard_output = options.discard_output;
    let capture_error = options.error_limit.is_some();
    let discard_error = options.discard_error;
    let inherited_input = options.inherited_input.take();
    let inherited_output = options.inherited_output.take();
    let inherited_error = options.inherited_error.take();
    let (stdin, input) = if input {
        let (stdio, pipe) = input_pipe().await?;
        (stdio, Some(pipe))
    } else {
        (
            if inherit_input {
                inherited_input.expect("snapshotted input")
            } else {
                Stdio::null()
            },
            None,
        )
    };
    let (stdout, output) = if let Some(fd) = inherited_output {
        (fd, None)
    } else {
        output_descriptor(capture_output, discard_output, 1).await?
    };
    let (stderr, error) = if let Some(fd) = inherited_error {
        (fd, None)
    } else {
        output_descriptor(capture_error, discard_error, 2).await?
    };
    Ok(Pipes {
        stdin,
        stdout,
        stderr,
        input,
        output,
        error,
    })
}

#[cfg(windows)]
pub struct Child(tokio::process::Child);
#[cfg(windows)]
impl Child {
    pub fn spawn(command: Command) -> io::Result<Self> {
        // Our Stdio handles already own the parent-side overlapped pipes. Tokio
        // sees no std::ChildStdin/Stdout/Stderr to convert into blocking workers.
        tokio::process::Command::from(command)
            .kill_on_drop(true)
            .spawn()
            .map(Self)
    }
    pub fn id(&self) -> Option<u32> {
        self.0.id()
    }
    pub fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
        self.0.try_wait()
    }
    pub async fn wait(&mut self) -> io::Result<ExitStatus> {
        self.0.wait().await
    }
    pub fn start_kill(&mut self) -> io::Result<()> {
        self.0.start_kill()
    }
}

#[cfg(unix)]
pub struct Child {
    inner: Option<std::process::Child>,
    notification: Option<AsyncFd<OwnedFd>>,
    notification_error: Option<io::Error>,
    status: Option<ExitStatus>,
}
#[cfg(unix)]
impl Child {
    pub fn spawn(mut command: Command) -> io::Result<Self> {
        let inner = command.spawn()?;
        // Keep the child owned even if notification registration fails. Its
        // first wait reports that failure; teardown can still kill/poll/reap it.
        let mut child = Self {
            inner: Some(inner),
            notification: None,
            notification_error: None,
            status: None,
        };
        // Establish the kill/reap Drop guard before notifier registration, so
        // an unexpected registration panic cannot abandon the spawned child.
        match exit_notification(child.id().expect("owned child")) {
            Ok(fd) => child.notification = fd,
            Err(error) => child.notification_error = Some(error),
        }
        Ok(child)
    }
    pub fn id(&self) -> Option<u32> {
        if self.status.is_some() {
            None
        } else {
            self.inner.as_ref().map(std::process::Child::id)
        }
    }
    pub fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
        if self.status.is_none() {
            self.status = self.inner.as_mut().expect("owned child").try_wait()?;
        }
        Ok(self.status)
    }
    pub async fn wait(&mut self) -> io::Result<ExitStatus> {
        if let Some(status) = self.try_wait()? {
            return Ok(status);
        }
        if let Some(error) = self.notification_error.take() {
            return Err(error);
        }
        loop {
            #[cfg(target_os = "macos")]
            let mut exit_observed = false;
            if let Some(fd) = &self.notification {
                let mut ready = fd.readable().await?;
                #[cfg(target_os = "macos")]
                match ready.try_io(|fd| consume_exit(fd.get_ref())) {
                    Ok(result) => {
                        result?;
                        exit_observed = true;
                    }
                    Err(_) => continue,
                }
                #[cfg(target_os = "linux")]
                ready.clear_ready();
            } else {
                // Older Linux kernels and denied pidfds use the same reactor;
                // resource errors are still failures. No SIGCHLD handler or
                // per-child worker is installed. Failed-notifier teardown and
                // already-consumed Darwin events also retain owned polling.
                tokio::time::sleep(std::time::Duration::from_millis(1)).await;
            }
            if let Some(status) = self.try_wait()? {
                return Ok(status);
            }
            // NOTE_EXIT is one-shot. If waitpid has not made the status visible
            // yet, retain ownership and poll briefly instead of waiting on an
            // event that was already consumed.
            #[cfg(target_os = "macos")]
            if exit_observed {
                self.notification = None;
            }
        }
    }
    pub fn start_kill(&mut self) -> io::Result<()> {
        if self.try_wait()?.is_some() {
            return Ok(());
        }
        self.inner.as_mut().expect("owned child").kill()
    }
}
#[cfg(unix)]
impl Drop for Child {
    fn drop(&mut self) {
        if self.status.is_some() {
            return;
        }
        if let Some(mut child) = self.inner.take() {
            let _ = child.kill();
            if !matches!(child.try_wait(), Ok(Some(_))) {
                orphan(child);
            }
        }
    }
}

#[cfg(target_os = "linux")]
fn exit_notification(pid: u32) -> io::Result<Option<AsyncFd<OwnedFd>>> {
    // SAFETY: pidfd_open creates a new owned descriptor, with no borrowed memory.
    let fd = unsafe { libc::syscall(libc::SYS_pidfd_open, pid, 0) };
    if fd == -1 {
        let error = io::Error::last_os_error();
        if matches!(
            error.raw_os_error(),
            Some(libc::ENOSYS | libc::EPERM | libc::EACCES)
        ) {
            return Ok(None);
        }
        return Err(error);
    }
    // SAFETY: This successful syscall returns a uniquely owned descriptor.
    AsyncFd::with_interest(
        unsafe { OwnedFd::from_raw_fd(fd as i32) },
        tokio::io::Interest::READABLE,
    )
    .map(Some)
}
#[cfg(target_os = "macos")]
fn exit_notification(pid: u32) -> io::Result<Option<AsyncFd<OwnedFd>>> {
    // SAFETY: kqueue creates a new descriptor; the event targets our unreaped PID.
    let raw = unsafe { libc::kqueue() };
    if raw == -1 {
        return Err(io::Error::last_os_error());
    }
    let fd = unsafe { OwnedFd::from_raw_fd(raw) };
    // SAFETY: These flags apply only to our owned kqueue descriptor. In
    // particular it must never leak into concurrently launched child processes.
    if unsafe { libc::fcntl(raw, libc::F_SETFD, libc::FD_CLOEXEC) } == -1 {
        return Err(io::Error::last_os_error());
    }
    let event = libc::kevent {
        ident: pid as libc::uintptr_t,
        filter: libc::EVFILT_PROC,
        flags: libc::EV_ADD | libc::EV_ENABLE | libc::EV_ONESHOT,
        fflags: libc::NOTE_EXIT,
        data: 0,
        udata: std::ptr::null_mut(),
    };
    // SAFETY: The live event and descriptor are borrowed only by this call.
    if unsafe {
        libc::kevent(
            fd.as_raw_fd(),
            &event,
            1,
            std::ptr::null_mut(),
            0,
            std::ptr::null(),
        )
    } == -1
    {
        let error = io::Error::last_os_error();
        // Darwin can stop accepting NOTE_EXIT before waitpid exposes the
        // exiting child's status. Retain ownership and poll this PID rather
        // than rejecting a successful short command. Resource failures still
        // propagate; no process-wide SIGCHLD handler is installed.
        if error.raw_os_error() == Some(libc::ESRCH) {
            return Ok(None);
        }
        return Err(error);
    }
    // Darwin kqueue descriptors support readable readiness, not EVFILT_WRITE.
    // kevent below is explicitly nonblocking through its zero timeout.
    AsyncFd::with_interest(fd, tokio::io::Interest::READABLE).map(Some)
}
#[cfg(target_os = "macos")]
fn consume_exit(fd: &OwnedFd) -> io::Result<()> {
    let mut event = std::mem::MaybeUninit::<libc::kevent>::uninit();
    let timeout = libc::timespec {
        tv_sec: 0,
        tv_nsec: 0,
    };
    // SAFETY: kevent initializes at most this one event; no blocking wait occurs.
    let count = unsafe {
        libc::kevent(
            fd.as_raw_fd(),
            std::ptr::null(),
            0,
            event.as_mut_ptr(),
            1,
            &timeout,
        )
    };
    match count {
        -1 => Err(io::Error::last_os_error()),
        0 => Err(io::ErrorKind::WouldBlock.into()),
        _ => Ok(()),
    }
}

#[cfg(unix)]
fn orphan(child: std::process::Child) {
    use std::sync::{mpsc, OnceLock};
    static REAPER: OnceLock<Option<mpsc::Sender<std::process::Child>>> = OnceLock::new();
    // Exceptional panic/unresolved-child fallback only. One maintenance thread
    // polls owned PIDs, never the JS environment or a blocking per-command wait.
    // napi's deferred pins the addon image before any child can be launched.
    let sender = REAPER.get_or_init(|| {
        let (sender, receiver) = mpsc::channel::<std::process::Child>();
        let thread = std::thread::Builder::new()
            .name("twill-reaper".into())
            .spawn(move || {
                let mut pending = Vec::new();
                loop {
                    match receiver.recv_timeout(std::time::Duration::from_millis(20)) {
                        Ok(child) => pending.push(child),
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                    }
                    pending.retain_mut(|child| !matches!(child.try_wait(), Ok(Some(_))));
                }
            });
        thread.ok().map(|_| sender)
    });
    // Thread exhaustion must not panic again while unwinding. An unresolved
    // child has already been killed/reported; this exceptional reaper is best
    // effort if the OS refuses a maintenance thread too.
    if let Some(sender) = sender {
        let _ = sender.send(child);
    }
}
