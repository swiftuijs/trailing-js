//! One asynchronous reactor per Node environment; no libuv worker per child.
mod platform;
mod process;

use napi::{bindgen_prelude::*, JsDeferred};
use napi_derive::napi;
use process::{Control, NativeOptions, NativeOutcome, Options};
use std::{
    collections::HashMap,
    ffi::c_void,
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Arc, Condvar, Mutex, OnceLock, PoisonError,
    },
};
use tokio::{
    runtime::Builder,
    sync::{mpsc, watch},
    task::JoinSet,
};

type Resolver = Box<dyn FnOnce(Env) -> Result<NativeOutcome> + Send>;
type Deferred = JsDeferred<NativeOutcome, Resolver>;

// Resolving/rejecting consumes the deferred. A task panic also settles it, while
// napi's environment-aware deferred prevents callbacks into a disposed worker.
struct Settlement(Option<Deferred>);
impl Settlement {
    fn complete(mut self, outcome: NativeOutcome) {
        if let Some(deferred) = self.0.take() {
            deferred.resolve(Box::new(move |_| Ok(outcome)));
        }
    }
}
impl Drop for Settlement {
    fn drop(&mut self) {
        if let Some(deferred) = self.0.take() {
            deferred.reject(Error::from_reason("Native subprocess task failed"));
        }
    }
}

enum Message {
    Run(u32, Box<Options>, watch::Receiver<Control>, Settlement),
    Shutdown(Option<usize>),
}
struct State {
    sender: mpsc::UnboundedSender<Message>,
    operations: Mutex<HashMap<u32, watch::Sender<Control>>>,
    sequence: AtomicU32,
    closing: AtomicBool,
    joined: Condvar,
}
struct Registration {
    owner: Arc<State>,
    id: u32,
}
impl Drop for Registration {
    fn drop(&mut self) {
        locked(&self.owner.operations).remove(&self.id);
        self.owner.joined.notify_all();
    }
}
type States = Mutex<HashMap<usize, Arc<State>>>;
static STATES: OnceLock<States> = OnceLock::new();
#[napi]
pub fn protocol() -> u32 {
    1
}
fn states() -> &'static States {
    STATES.get_or_init(Mutex::default)
}
fn locked<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

// Node calls this exactly once on the environment's owning thread. The async
// hook remains registered until all that environment's children have finished
// bounded teardown; a worker can terminate without leaking a live child.
unsafe extern "C" fn cleanup(handle: napi::sys::napi_async_cleanup_hook_handle, data: *mut c_void) {
    // SAFETY: state() hands Node this unique Box, consumed only by this callback.
    let (key, state) = unsafe { *Box::from_raw(data.cast::<(usize, Arc<State>)>()) };
    state.closing.store(true, Ordering::SeqCst);
    locked(states()).remove(&key);
    for control in locked(&state.operations).values() {
        control.send_replace(Control::Shutdown);
    }
    if state
        .sender
        .send(Message::Shutdown(Some(handle as usize)))
        .is_err()
    {
        // SAFETY: The reactor is already gone; no commands remain. Node permits
        // removing an async cleanup hook from any thread, including this one.
        unsafe { napi::sys::napi_remove_async_cleanup_hook(handle) };
    }
}

fn state(env: Env) -> Result<Arc<State>> {
    let key = env.raw() as usize;
    let mut registry = locked(states());
    if let Some(state) = registry.get(&key) {
        return Ok(Arc::clone(state));
    }
    platform::available().map_err(|error| {
        Error::from_reason(format!(
            "Native process notifications are unavailable: {error}"
        ))
    })?;
    let runtime = Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| Error::from_reason(format!("Native reactor could not start: {error}")))?;
    let (sender, mut receiver) = mpsc::unbounded_channel();
    let state = Arc::new(State {
        sender,
        operations: Mutex::default(),
        sequence: AtomicU32::new(0),
        closing: AtomicBool::new(false),
        joined: Condvar::new(),
    });
    let owner = Arc::clone(&state);
    std::thread::Builder::new()
        .name("twill-subprocess".into())
        .spawn(move || {
            let cleanup_handle = runtime.block_on(async move {
                let mut tasks = JoinSet::new();
                let mut shutting_down = false;
                let mut cleanup_handle = None;
                loop {
                    if shutting_down && tasks.is_empty() {
                        break;
                    }
                    tokio::select! {
                        message = receiver.recv(), if !shutting_down => match message {
                            Some(Message::Run(id, options, control, settlement)) => {
                                let owner = Arc::clone(&owner);
                                tasks.spawn(async move {
                                let _registration = Registration { owner, id };
                                let outcome = process::execute(*options, control).await;
                                    settlement.complete(outcome);
                                });
                            }
                            Some(Message::Shutdown(handle)) => {
                                shutting_down = true;
                                cleanup_handle = handle;
                                for control in locked(&owner.operations).values() {
                                    control.send_replace(Control::Shutdown);
                                }
                            }
                            None => { shutting_down = true; }
                        },
                        _ = tasks.join_next(), if !tasks.is_empty() => {}
                    }
                }
                cleanup_handle
            });
            // Dropping the idle runtime releases OS reactor handles before Node is
            // told the hook is complete. No per-process blocking waits run here.
            drop(runtime);
            if let Some(handle) = cleanup_handle {
                // SAFETY: The live hook handle was passed by Node and uniquely moved
                // to this reactor. Removal is explicitly valid from any thread.
                unsafe { napi::sys::napi_remove_async_cleanup_hook(handle as _) };
            }
        })
        .map_err(|error| Error::from_reason(format!("Native reactor thread failed: {error}")))?;
    let data = Box::into_raw(Box::new((key, Arc::clone(&state))));
    // SAFETY: Node stores the Box until cleanup, while the addon image remains
    // loaded. Register on the owning JS thread; no N-API values cross threads.
    let status = unsafe {
        napi::sys::napi_add_async_cleanup_hook(
            env.raw(),
            Some(cleanup),
            data.cast(),
            std::ptr::null_mut(),
        )
    };
    if status != napi::sys::Status::napi_ok {
        // SAFETY: Registration failed, so Node never took ownership of the Box.
        unsafe { drop(Box::from_raw(data)) };
        let _ = state.sender.send(Message::Shutdown(None));
        return Err(Error::from_reason(
            "Native environment cleanup registration failed",
        ));
    }
    registry.insert(key, Arc::clone(&state));
    Ok(state)
}

#[napi(catch_unwind)]
pub fn start<'env>(env: Env, options: NativeOptions) -> Result<Object<'env>> {
    let options = Options::validate(options)?;
    let state = state(env)?;
    if state.closing.load(Ordering::SeqCst) {
        return Err(Error::from_reason("Native environment is shutting down"));
    }
    let id = state
        .sequence
        .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |id| id.checked_add(1))
        .map_err(|_| Error::from_reason("Native operation identifier exhausted"))?;
    let (deferred, promise) = env.create_deferred::<NativeOutcome, Resolver>()?;
    let mut job = Object::new(&env)?;
    job.set_named_property("id", id)?;
    job.set_named_property("promise", promise)?;
    let (sender, receiver) = watch::channel(Control::None);
    locked(&state.operations).insert(id, sender);
    if state
        .sender
        .send(Message::Run(
            id,
            Box::new(options),
            receiver,
            Settlement(Some(deferred)),
        ))
        .is_err()
    {
        locked(&state.operations).remove(&id);
        return Err(Error::from_reason("Native reactor is unavailable"));
    }
    // The newly created object stays in this native call's JS handle scope; its
    // value is immediately returned to that same environment by the N-API shim.
    Ok(Object::from_raw(env.raw(), job.raw()))
}

#[napi(catch_unwind)]
pub fn cancel(env: Env, id: u32, setup_failure: bool) {
    if let Some(state) = locked(states()).get(&(env.raw() as usize)) {
        if let Some(control) = locked(&state.operations).get(&id) {
            // Preserve the first cancellation request; late abort cannot change
            // an earlier native I/O failure or a completed result.
            control.send_if_modified(|value| {
                if *value == Control::None {
                    *value = if setup_failure {
                        Control::Setup
                    } else {
                        Control::Abort
                    };
                    true
                } else {
                    false
                }
            });
        }
    }
}

/// process.exit does not pump JS promises or asynchronous cleanup hooks. Its JS
/// exit listener calls this bounded native barrier while the reactor can still
/// terminate/reap children independently of the blocked JS event loop.
#[napi(catch_unwind)]
pub fn shutdown(env: Env) {
    let state = locked(states()).get(&(env.raw() as usize)).cloned();
    if let Some(state) = state {
        state.closing.store(true, Ordering::SeqCst);
        let operations = locked(&state.operations);
        for control in operations.values() {
            control.send_replace(Control::Shutdown);
        }
        let _ = state.joined.wait_timeout_while(
            operations,
            std::time::Duration::from_millis(1100),
            |operations| !operations.is_empty(),
        );
    }
}
