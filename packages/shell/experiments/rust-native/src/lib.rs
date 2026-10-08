//! An explicitly selected, Linux-only performance experiment, not the shell SDK.
#[cfg(not(target_os = "linux"))]
compile_error!("The native subprocess experiment currently requires Linux and pidfd support");

use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::{
    collections::HashMap,
    io::{self, Read, Write},
    os::{
        fd::{AsRawFd, FromRawFd, OwnedFd},
        unix::process::ExitStatusExt,
    },
    panic::{catch_unwind, AssertUnwindSafe},
    process::{Child, Command, ExitStatus, Stdio},
    time::{Duration, Instant},
};

const MAX_CAPTURE: u32 = 64 * 1024 * 1024;
const CHUNK: usize = 64 * 1024;

#[napi(object)]
pub struct NativeOptions {
    pub executable: String,
    pub arguments: Vec<String>,
    pub cwd: Option<String>,
    /// Call-time snapshot replacing the child environment; never mutate the parent.
    pub environment: HashMap<String, String>,
    pub input: Option<Buffer>,
    pub output_limit: Option<f64>,
    pub error_limit: Option<f64>,
    pub discard_output: bool,
    pub discard_error: bool,
    pub timeout_ms: f64,
}

#[napi(object)]
pub struct NativeResult {
    pub process_identifier: u32,
    pub code: Option<i32>,
    pub signal: Option<i32>,
    pub standard_output: Option<Buffer>,
    pub standard_error: Option<Buffer>,
}

struct Options {
    executable: String,
    arguments: Vec<String>,
    cwd: Option<String>,
    environment: HashMap<String, String>,
    input: Option<Vec<u8>>,
    output_limit: Option<usize>,
    error_limit: Option<usize>,
    discard_output: bool,
    discard_error: bool,
    deadline: Instant,
}

pub struct RunTask(Options);
pub struct Completed {
    pid: u32,
    status: ExitStatus,
    output: Option<Vec<u8>>,
    error: Option<Vec<u8>>,
}

fn invalid(message: &str) -> Error {
    Error::new(Status::InvalidArg, message)
}

#[napi]
pub fn run(options: NativeOptions) -> Result<AsyncTask<RunTask>> {
    if options.executable.is_empty()
        || options.executable.contains('\0')
        || options.arguments.iter().any(|a| a.contains('\0'))
        || options.cwd.as_ref().is_some_and(|v| v.contains('\0'))
        || ({
            options
                .environment
                .iter()
                .any(|(k, v)| k.is_empty() || k.contains(['\0', '=']) || v.contains('\0'))
        })
    {
        return Err(invalid(
            "Invalid literal executable, argv, cwd or environment",
        ));
    }
    if !options.timeout_ms.is_finite()
        || options.timeout_ms.fract() != 0.0
        || options.timeout_ms < 1.0
        || options.timeout_ms > 60_000.0
        || [options.output_limit, options.error_limit]
            .into_iter()
            .flatten()
            .any(|limit| {
                !limit.is_finite()
                    || limit.fract() != 0.0
                    || limit < 1.0
                    || limit > MAX_CAPTURE as f64
            })
        || (options.output_limit.is_some() && options.discard_output)
        || (options.error_limit.is_some() && options.discard_error)
    {
        return Err(invalid("Invalid experimental timeout or output policy"));
    }
    Ok(AsyncTask::new(RunTask(Options {
        executable: options.executable,
        arguments: options.arguments,
        cwd: options.cwd,
        environment: options.environment,
        // The worker never reads mutable V8 storage. This input copy is timed.
        input: options.input.map(|bytes| bytes.to_vec()),
        output_limit: options.output_limit.map(|n| n as usize),
        error_limit: options.error_limit.map(|n| n as usize),
        discard_output: options.discard_output,
        discard_error: options.discard_error,
        deadline: Instant::now() + Duration::from_millis(options.timeout_ms as u64),
    })))
}

impl Task for RunTask {
    type Output = Completed;
    type JsValue = NativeResult;

    fn compute(&mut self) -> Result<Completed> {
        catch_unwind(AssertUnwindSafe(|| perform(&self.0)))
            .map_err(|_| Error::from_reason("Native experiment panicked"))?
            .map_err(|error| Error::from_reason(error.to_string()))
    }

    fn resolve(&mut self, _env: Env, completed: Completed) -> Result<NativeResult> {
        Ok(NativeResult {
            process_identifier: completed.pid,
            code: completed.status.code(),
            signal: completed.status.signal(),
            standard_output: completed.output.map(Buffer::from),
            standard_error: completed.error.map(Buffer::from),
        })
    }
}

// A panic/error after launch cannot abandon an owned direct child. Unlike the SDK,
// this experiment uses immediate kill and a blocking reap, not graceful cancellation.
struct OwnedChild {
    child: Child,
    reaped: bool,
}
impl OwnedChild {
    fn cleanup(&mut self) -> Option<String> {
        if self.reaped {
            return None;
        }
        let kill_error = self.child.kill().err();
        match self.child.wait() {
            Ok(_) => {
                self.reaped = true;
                kill_error
                    .filter(|error| {
                        error.kind() != io::ErrorKind::InvalidInput
                            && error.raw_os_error() != Some(libc::ESRCH)
                    })
                    .map(|error| format!("direct-child kill: {error}"))
            }
            Err(error) => Some(format!(
                "direct-child reap: {error}; unresolved PID {}",
                self.child.id()
            )),
        }
    }
}
impl Drop for OwnedChild {
    fn drop(&mut self) {
        let _ = self.cleanup();
    }
}

fn nonblocking(stream: &impl AsRawFd) -> io::Result<()> {
    // SAFETY: The borrowed, live descriptor is not closed by these fcntl calls.
    let flags = unsafe { libc::fcntl(stream.as_raw_fd(), libc::F_GETFL) };
    if flags == -1
        || unsafe { libc::fcntl(stream.as_raw_fd(), libc::F_SETFL, flags | libc::O_NONBLOCK) } == -1
    {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

fn descriptor(fd: Option<i32>, events: i16) -> libc::pollfd {
    libc::pollfd {
        fd: fd.unwrap_or(-1),
        events,
        revents: 0,
    }
}

fn capture<R: Read>(
    stream: &mut Option<R>,
    bytes: &mut Vec<u8>,
    limit: usize,
    channel: &str,
    chunk: &mut [u8; CHUNK],
) -> io::Result<()> {
    match stream.as_mut().expect("live reader").read(chunk) {
        Ok(0) => {
            *stream = None;
        }
        Ok(count) => {
            if count > limit - bytes.len() {
                return Err(io::Error::other(format!("{channel} byte limit exceeded")));
            }
            let needed = bytes.len() + count;
            if needed > bytes.capacity() {
                let capacity = needed.max(bytes.capacity().saturating_mul(2)).min(limit);
                bytes
                    .try_reserve_exact(capacity - bytes.len())
                    .map_err(io::Error::other)?;
            }
            bytes.extend_from_slice(&chunk[..count]);
        }
        Err(error)
            if matches!(
                error.kind(),
                io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
            ) => {}
        Err(error) => return Err(error),
    }
    Ok(())
}

fn output_policy(limit: Option<usize>, discard: bool) -> Stdio {
    if limit.is_some() {
        Stdio::piped()
    } else if discard {
        Stdio::null()
    } else {
        Stdio::inherit()
    }
}

fn perform(options: &Options) -> io::Result<Completed> {
    let mut command = Command::new(&options.executable);
    command
        .args(&options.arguments)
        .stdin(if options.input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(output_policy(options.output_limit, options.discard_output))
        .stderr(output_policy(options.error_limit, options.discard_error));
    if let Some(cwd) = &options.cwd {
        command.current_dir(cwd);
    }
    command.env_clear().envs(&options.environment);
    if Instant::now() >= options.deadline {
        return Err(io::Error::new(
            io::ErrorKind::TimedOut,
            "Native experimental deadline exceeded before launch",
        ));
    }
    let mut owned = OwnedChild {
        child: command.spawn()?,
        reaped: false,
    };
    match communicate(options, &mut owned) {
        Ok(result) => Ok(result),
        Err(primary) => match owned.cleanup() {
            None => Err(primary),
            Some(secondary) => Err(io::Error::other(format!("{primary}; cleanup: {secondary}"))),
        },
    }
}

fn communicate(options: &Options, owned: &mut OwnedChild) -> io::Result<Completed> {
    let pid = owned.child.id();
    // SAFETY: pidfd_open receives a positive child PID and flags=0, no pointers.
    let raw_pidfd = unsafe { libc::syscall(libc::SYS_pidfd_open, pid, 0) };
    if raw_pidfd == -1 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: The successful syscall created a new descriptor, now uniquely owned.
    let mut pidfd = Some(unsafe { OwnedFd::from_raw_fd(raw_pidfd as i32) });
    let mut input = owned.child.stdin.take();
    let mut output = owned.child.stdout.take();
    let mut error = owned.child.stderr.take();
    if let Some(pipe) = &input {
        nonblocking(pipe)?;
    }
    if let Some(pipe) = &output {
        nonblocking(pipe)?;
    }
    if let Some(pipe) = &error {
        nonblocking(pipe)?;
    }
    let input_bytes = options.input.as_deref().unwrap_or_default();
    let mut written = 0;
    if input_bytes.is_empty() {
        input = None;
    }
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();
    let deadline = options.deadline;
    let mut chunk = [0_u8; CHUNK];
    let mut status = None;
    while status.is_none() || input.is_some() || output.is_some() || error.is_some() {
        let remaining = deadline
            .checked_duration_since(Instant::now())
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::TimedOut,
                    "Native experimental deadline exceeded",
                )
            })?;
        let mut descriptors = [
            descriptor(pidfd.as_ref().map(AsRawFd::as_raw_fd), libc::POLLIN),
            descriptor(input.as_ref().map(AsRawFd::as_raw_fd), libc::POLLOUT),
            descriptor(output.as_ref().map(AsRawFd::as_raw_fd), libc::POLLIN),
            descriptor(error.as_ref().map(AsRawFd::as_raw_fd), libc::POLLIN),
        ];
        // SAFETY: This mutable array contains live owned/borrowed descriptors or -1;
        // poll writes only its four revents fields, and none are closed concurrently.
        let result = unsafe {
            libc::poll(
                descriptors.as_mut_ptr(),
                descriptors.len() as libc::nfds_t,
                remaining.as_millis().clamp(1, i32::MAX as u128) as i32,
            )
        };
        if result == -1 {
            let failure = io::Error::last_os_error();
            if failure.kind() == io::ErrorKind::Interrupted {
                continue;
            }
            return Err(failure);
        }
        if descriptors
            .iter()
            .any(|fd| fd.revents & libc::POLLNVAL != 0)
        {
            return Err(io::Error::other("Invalid owned pipe descriptor"));
        }
        // Read one chunk per ready stream/turn to preserve fairness and deadlines.
        if output.is_some() && descriptors[2].revents != 0 {
            capture(
                &mut output,
                &mut stdout,
                options.output_limit.unwrap(),
                "stdout",
                &mut chunk,
            )?;
        }
        if error.is_some() && descriptors[3].revents != 0 {
            capture(
                &mut error,
                &mut stderr,
                options.error_limit.unwrap(),
                "stderr",
                &mut chunk,
            )?;
        }
        if let Some(writer) = input.as_mut().filter(|_| descriptors[1].revents != 0) {
            match writer.write(&input_bytes[written..input_bytes.len().min(written + CHUNK)]) {
                Ok(0) => {
                    return Err(io::Error::new(
                        io::ErrorKind::WriteZero,
                        "stdin write returned zero",
                    ))
                }
                Ok(count) => {
                    written += count;
                    if written == input_bytes.len() {
                        input = None;
                    }
                }
                Err(e)
                    if matches!(
                        e.kind(),
                        io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                    ) => {}
                Err(e) => return Err(e),
            }
        }
        if pidfd.is_some() && descriptors[0].revents != 0 {
            if let Some(value) = owned.child.try_wait()? {
                owned.reaped = true;
                status = Some(value);
                pidfd = None;
            }
        }
    }
    Ok(Completed {
        pid,
        status: status.unwrap(),
        output: options.output_limit.map(|_| stdout),
        error: options.error_limit.map(|_| stderr),
    })
}
