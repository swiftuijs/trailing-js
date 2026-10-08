use crate::platform::{self, Child, ReadPipe};
use napi::bindgen_prelude::*;
use napi_derive::napi;
#[cfg(unix)]
use std::os::unix::process::ExitStatusExt;
use std::{
    collections::HashMap,
    io,
    process::{Command, ExitStatus, Stdio},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::watch,
    time::{self, Instant},
};

const CHUNK: usize = 64 * 1024;
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Control {
    None,
    Abort,
    Setup,
    Shutdown,
}

#[napi(object)]
pub struct NativeOptions {
    pub executable: String,
    pub arguments: Vec<String>,
    pub cwd: Option<String>,
    pub environment: HashMap<String, String>,
    pub input: Option<Buffer>,
    pub inherit_input: bool,
    pub output_limit: Option<f64>,
    pub error_limit: Option<f64>,
    pub discard_output: bool,
    pub discard_error: bool,
    pub timeout_ms: Option<f64>,
    pub grace_period_ms: f64,
    pub kill_timeout_ms: f64,
}
pub struct Options {
    pub executable: String,
    pub arguments: Vec<String>,
    pub cwd: Option<String>,
    pub environment: HashMap<String, String>,
    pub input: Option<Vec<u8>>,
    pub inherit_input: bool,
    pub output_limit: Option<usize>,
    pub error_limit: Option<usize>,
    pub discard_output: bool,
    pub discard_error: bool,
    pub deadline: Option<Instant>,
    pub grace: Duration,
    pub join: Duration,
    pub inherited_input: Option<Stdio>,
    pub inherited_output: Option<Stdio>,
    pub inherited_error: Option<Stdio>,
}
impl Options {
    pub fn validate(value: NativeOptions) -> Result<Self> {
        let invalid = |message| Error::new(Status::InvalidArg, message);
        if value.executable.is_empty()
            || value.executable.contains('\0')
            || value.arguments.iter().any(|arg| arg.contains('\0'))
            || value
                .cwd
                .as_ref()
                .is_some_and(|cwd| cwd.is_empty() || cwd.contains('\0'))
            || value
                .environment
                .iter()
                .any(|(key, val)| key.is_empty() || key.contains(['\0', '=']) || val.contains('\0'))
            || (value.inherit_input && value.input.is_some())
        {
            return Err(invalid(
                "Invalid native executable, arguments, cwd, environment or input",
            ));
        }
        let duration = |n: f64, minimum: f64| -> Result<Duration> {
            if !n.is_finite() || n.fract() != 0.0 || n < minimum || n > i32::MAX as f64 {
                return Err(invalid("Invalid native duration"));
            }
            Ok(Duration::from_millis(n as u64))
        };
        let limit = |n: Option<f64>, discard: bool| -> Result<Option<usize>> {
            if let Some(n) = n {
                if discard
                    || !n.is_finite()
                    || n.fract() != 0.0
                    || !(1.0..=9_007_199_254_740_991.0).contains(&n)
                    || n > isize::MAX as f64
                {
                    return Err(invalid("Invalid native byte limit"));
                }
            }
            Ok(n.map(|n| n as usize))
        };
        let deadline = value
            .timeout_ms
            .map(|n| duration(n, 1.0).map(|duration| Instant::now() + duration))
            .transpose()?;
        #[cfg(windows)]
        {
            let executable = value
                .executable
                .trim_end_matches([' ', '.'])
                .to_ascii_lowercase();
            if executable.ends_with(".cmd") || executable.ends_with(".bat") {
                return Err(invalid(
                    "Batch files require an explicitly selected command interpreter",
                ));
            }
        }
        let inherited_input = if value.inherit_input {
            Some(platform::inherited(0).map_err(|error| Error::from_reason(error.to_string()))?)
        } else {
            None
        };
        let inherited_output = if value.output_limit.is_none() && !value.discard_output {
            Some(platform::inherited(1).map_err(|error| Error::from_reason(error.to_string()))?)
        } else {
            None
        };
        let inherited_error = if value.error_limit.is_none() && !value.discard_error {
            Some(platform::inherited(2).map_err(|error| Error::from_reason(error.to_string()))?)
        } else {
            None
        };
        let mut input = None;
        if let Some(bytes) = value.input {
            let mut owned = Vec::new();
            owned
                .try_reserve_exact(bytes.len())
                .map_err(|e| Error::from_reason(e.to_string()))?;
            owned.extend_from_slice(&bytes);
            input = Some(owned);
        }
        Ok(Self {
            executable: value.executable,
            arguments: value.arguments,
            cwd: value.cwd,
            environment: value.environment,
            input,
            inherit_input: value.inherit_input,
            output_limit: limit(value.output_limit, value.discard_output)?,
            error_limit: limit(value.error_limit, value.discard_error)?,
            discard_output: value.discard_output,
            discard_error: value.discard_error,
            deadline,
            grace: duration(value.grace_period_ms, 0.0)?,
            join: duration(value.kill_timeout_ms, 1.0)?,
            inherited_input,
            inherited_output,
            inherited_error,
        })
    }
}

#[napi(object)]
pub struct Failure {
    pub kind: String,
    pub message: String,
    pub stream: Option<String>,
    pub code: Option<String>,
    pub os_code: Option<i32>,
}
impl Failure {
    fn simple(kind: &str, message: &str) -> Self {
        Self {
            kind: kind.into(),
            message: message.into(),
            stream: None,
            code: None,
            os_code: None,
        }
    }
    fn io(kind: &str, stream: Option<&str>, error: io::Error) -> Self {
        let code = match error.kind() {
            #[cfg(windows)]
            _ if kind == "launch" && error.raw_os_error() == Some(267) => Some("ENOENT"),
            io::ErrorKind::NotADirectory => Some("ENOTDIR"),
            io::ErrorKind::NotFound => Some("ENOENT"),
            io::ErrorKind::PermissionDenied => Some("EACCES"),
            io::ErrorKind::BrokenPipe => Some("EPIPE"),
            io::ErrorKind::InvalidInput => Some("EINVAL"),
            io::ErrorKind::AlreadyExists => Some("EEXIST"),
            _ => None,
        };
        Self {
            kind: kind.into(),
            stream: stream.map(str::to_owned),
            message: error.to_string(),
            code: code.map(str::to_owned),
            os_code: error.raw_os_error(),
        }
    }
}
#[napi(object)]
pub struct NativeOutcome {
    pub process_identifier: Option<u32>,
    pub code: Option<i32>,
    pub signal: Option<i32>,
    pub windows_signal: Option<String>,
    pub standard_output: Option<Buffer>,
    pub standard_error: Option<Buffer>,
    pub failure: Option<Failure>,
    pub cleanup_errors: Vec<Failure>,
    pub unresolved_process_identifier: Option<u32>,
}
impl NativeOutcome {
    fn empty(failure: Option<Failure>) -> Self {
        Self {
            process_identifier: None,
            code: None,
            signal: None,
            windows_signal: None,
            standard_output: None,
            standard_error: None,
            failure,
            cleanup_errors: Vec::new(),
            unresolved_process_identifier: None,
        }
    }
    fn status(&mut self, status: ExitStatus) {
        self.code = status.code();
        #[cfg(unix)]
        {
            self.signal = status.signal();
        }
    }
}
fn canceled(control: Control) -> Option<Failure> {
    match control {
        Control::None => None,
        Control::Abort => Some(Failure::simple("abort", "Subprocess aborted")),
        Control::Setup => Some(Failure::simple(
            "setup",
            "Subprocess cancellation setup failed",
        )),
        Control::Shutdown => Some(Failure::simple(
            "shutdown",
            "Native environment is shutting down",
        )),
    }
}
struct Reader<R> {
    pipe: Option<R>,
    bytes: Vec<u8>,
    chunk: Vec<u8>,
    limit: usize,
    name: &'static str,
}
impl<R: tokio::io::AsyncRead + Unpin> Reader<R> {
    fn new(pipe: Option<R>, limit: Option<usize>, name: &'static str) -> Self {
        let chunk = if pipe.is_some() {
            vec![0; CHUNK]
        } else {
            Vec::new()
        };
        Self {
            pipe,
            bytes: Vec::new(),
            chunk,
            limit: limit.unwrap_or(0),
            name,
        }
    }
    async fn read(&mut self, retain: bool) -> std::result::Result<(), Failure> {
        match self
            .pipe
            .as_mut()
            .expect("owned reader")
            .read(&mut self.chunk)
            .await
        {
            Ok(0) => self.pipe = None,
            Ok(count) if retain => {
                if count > self.limit - self.bytes.len() {
                    let mut failure =
                        Failure::simple("limit", "Subprocess output exceeded its byte limit");
                    failure.stream = Some(self.name.into());
                    return Err(failure);
                }
                let needed = self.bytes.len() + count;
                if needed > self.bytes.capacity() {
                    let capacity = needed
                        .max(self.bytes.capacity().saturating_mul(2))
                        .min(self.limit);
                    self.bytes
                        .try_reserve_exact(capacity - self.bytes.len())
                        .map_err(|e| Failure::io("io", Some(self.name), io::Error::other(e)))?;
                }
                self.bytes.extend_from_slice(&self.chunk[..count]);
            }
            Ok(_) => {}
            Err(error) => {
                self.pipe = None;
                return Err(Failure::io("io", Some(self.name), error));
            }
        }
        Ok(())
    }
}

pub async fn execute(mut options: Options, mut control: watch::Receiver<Control>) -> NativeOutcome {
    if let Some(failure) = canceled(*control.borrow()) {
        return NativeOutcome::empty(Some(failure));
    }
    if options
        .deadline
        .is_some_and(|deadline| deadline <= Instant::now())
    {
        return NativeOutcome::empty(Some(Failure::simple(
            "timeout",
            "Subprocess timed out before launch",
        )));
    }
    let mut command = Command::new(&options.executable);
    let pipes = match platform::pipes(&mut options).await {
        Ok(value) => value,
        Err(error) => return NativeOutcome::empty(Some(Failure::io("launch", None, error))),
    };
    command
        .args(&options.arguments)
        .env_clear()
        .envs(&options.environment)
        .stdin(pipes.stdin)
        .stdout(pipes.stdout)
        .stderr(pipes.stderr);
    if let Some(cwd) = &options.cwd {
        command.current_dir(cwd);
    }
    if let Some(failure) = canceled(*control.borrow()) {
        return NativeOutcome::empty(Some(failure));
    }
    if options
        .deadline
        .is_some_and(|deadline| deadline <= Instant::now())
    {
        return NativeOutcome::empty(Some(Failure::simple(
            "timeout",
            "Subprocess timed out before launch",
        )));
    }
    let mut child = match Child::spawn(command) {
        Ok(child) => child,
        Err(error) => return NativeOutcome::empty(Some(Failure::io("launch", None, error))),
    };
    let mut outcome = NativeOutcome::empty(None);
    outcome.process_identifier = child.id();
    let mut input = pipes.input;
    let mut output = Reader::<ReadPipe>::new(pipes.output, options.output_limit, "stdout");
    let mut error = Reader::<ReadPipe>::new(pipes.error, options.error_limit, "stderr");
    let bytes = options.input.as_deref().unwrap_or_default();
    let mut written = 0;
    if bytes.is_empty() {
        input = None;
    }
    let mut status = None;
    let deadline = time::sleep_until(
        options
            .deadline
            .unwrap_or_else(|| Instant::now() + Duration::from_secs(31_536_000)),
    );
    tokio::pin!(deadline);
    while status.is_none() || input.is_some() || output.pipe.is_some() || error.pipe.is_some() {
        // Check control/deadline before each chunk, then let readiness selection
        // rotate fairly between the two readers and writer under backpressure.
        if let Some(failure) = canceled(*control.borrow()) {
            outcome.failure = Some(failure);
            break;
        }
        if options
            .deadline
            .is_some_and(|deadline| deadline <= Instant::now())
        {
            outcome.failure = Some(Failure::simple("timeout", "Subprocess timed out"));
            break;
        }
        tokio::select! {
            changed = control.changed() => {
                let failure = if changed.is_err() { canceled(Control::Shutdown) } else { canceled(*control.borrow()) };
                if failure.is_some() { outcome.failure = failure; break; }
            }
            _ = &mut deadline, if options.deadline.is_some() => {
                outcome.failure = Some(Failure::simple("timeout", "Subprocess timed out")); break;
            }
            result = child.wait(), if status.is_none() => match result {
                Ok(value) => status = Some(value),
                Err(failure) => { outcome.failure = Some(Failure::io("process", None, failure)); break; }
            },
            result = output.read(true), if output.pipe.is_some() => {
                if let Err(failure) = result { outcome.failure = Some(failure); break; }
            }
            result = error.read(true), if error.pipe.is_some() => {
                if let Err(failure) = result { outcome.failure = Some(failure); break; }
            }
            result = async { input.as_mut().expect("owned input").write(&bytes[written..bytes.len().min(written + CHUNK)]).await }, if input.is_some() => match result {
                Ok(0) => { outcome.failure = Some(Failure::io("io", Some("stdin"), io::Error::new(io::ErrorKind::WriteZero, "stdin write returned zero"))); break; }
                Ok(count) => { written += count; if written == bytes.len() { input = None; } }
                Err(failure) => { outcome.failure = Some(Failure::io("io", Some("stdin"), failure)); break; }
            }
        }
    }
    drop(input);
    if outcome.failure.is_some() {
        teardown(
            &options,
            &mut control,
            &mut child,
            &mut status,
            &mut output,
            &mut error,
            &mut outcome,
        )
        .await;
    }
    if let Some(status) = status {
        outcome.status(status);
    }
    outcome.standard_output = options.output_limit.map(|_| Buffer::from(output.bytes));
    outcome.standard_error = options.error_limit.map(|_| Buffer::from(error.bytes));
    outcome
}

async fn teardown(
    options: &Options,
    control: &mut watch::Receiver<Control>,
    child: &mut Child,
    status: &mut Option<ExitStatus>,
    output: &mut Reader<ReadPipe>,
    error: &mut Reader<ReadPipe>,
    outcome: &mut NativeOutcome,
) {
    if status.is_none() {
        match child.try_wait() {
            Ok(value) => *status = value,
            Err(failure) => outcome
                .cleanup_errors
                .push(Failure::io("process", None, failure)),
        }
    }
    if status.is_some() {
        output.pipe = None;
        error.pipe = None;
        return;
    }
    let shutdown = *control.borrow() == Control::Shutdown;
    let mut soft = false;
    if !shutdown {
        #[cfg(unix)]
        if let Some(pid) = child.id() {
            // SAFETY: This direct child is still owned and unreaped, so its PID
            // cannot be recycled while this call delivers a termination signal.
            if unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM) } == -1 {
                let failure = io::Error::last_os_error();
                if failure.raw_os_error() != Some(libc::ESRCH) {
                    outcome
                        .cleanup_errors
                        .push(Failure::io("process", None, failure));
                }
            } else {
                soft = true;
            }
        }
        #[cfg(windows)]
        match child.start_kill() {
            Ok(()) => {
                soft = true;
                outcome.windows_signal = Some("SIGTERM".into());
            }
            Err(failure) => outcome
                .cleanup_errors
                .push(Failure::io("process", None, failure)),
        }
    }
    if soft && !options.grace.is_zero() {
        let grace = time::sleep(options.grace);
        tokio::pin!(grace);
        loop {
            tokio::select! {
                _ = &mut grace => break,
                changed = control.changed() => { if changed.is_err() || *control.borrow() == Control::Shutdown { break; } }
                result = child.wait() => { match result { Ok(value) => *status = Some(value), Err(failure) => outcome.cleanup_errors.push(Failure::io("process", None, failure)) }; break; }
                result = output.read(false), if output.pipe.is_some() => { if let Err(failure) = result { outcome.cleanup_errors.push(failure); } }
                result = error.read(false), if error.pipe.is_some() => { if let Err(failure) = result { outcome.cleanup_errors.push(failure); } }
            }
        }
    }
    output.pipe = None;
    error.pipe = None;
    if status.is_some() {
        return;
    }
    match child.start_kill() {
        Ok(()) => {
            #[cfg(windows)]
            {
                outcome.windows_signal = Some("SIGKILL".into());
            }
        }
        Err(failure) => outcome
            .cleanup_errors
            .push(Failure::io("process", None, failure)),
    }
    let join = if *control.borrow() == Control::Shutdown {
        options.join.min(Duration::from_millis(1000))
    } else {
        options.join
    };
    let deadline = time::sleep(join);
    tokio::pin!(deadline);
    let failure = loop {
        tokio::select! {
            _ = &mut deadline => break Some(Failure::simple("teardown", "Owned subprocess could not be terminated")),
            result = child.wait() => match result {
                Ok(value) => { *status = Some(value); break None; }
                Err(failure) => break Some(Failure::io("teardown", None, failure)),
            },
            changed = control.changed() => {
                // Environment disposal can arrive after ordinary failure teardown
                // already began with a longer user-configured join. Shorten that
                // pending join too, rather than waiting out the original timer.
                if changed.is_err() || *control.borrow() == Control::Shutdown {
                    let bound = deadline.deadline().min(Instant::now() + Duration::from_millis(1000));
                    deadline.as_mut().reset(bound);
                }
            }
        }
    };
    if let Some(failure) = failure {
        outcome.unresolved_process_identifier = child.id();
        outcome.cleanup_errors.push(failure);
    }
}
