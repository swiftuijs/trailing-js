import childProcess, { type ChildProcess } from 'node:child_process';
import { addAbortListener } from 'node:events';
import type { Readable } from 'node:stream';
import {
  Command,
  childEnvironment,
  settings,
  type OutputPolicy,
  type OutputValue,
  type RunOptions,
  type InheritedOutput,
} from './values.js';
import {
  ProcessError,
  ProcessLaunchError,
  ProcessAbortError,
  ProcessTimeoutError,
  ProcessExitError,
  ProcessIOError,
  OutputLimitError,
  ProcessTeardownError,
} from './errors.js';
export { Command, Environment, Input, Output } from './values.js';
export type {
  OutputPolicy,
  OutputValue,
  RunOptions,
  ProcessInput,
  InputPolicy,
  InheritedOutput,
  DiscardedOutput,
  TextOutput,
  ByteOutput,
} from './values.js';
export {
  ProcessError,
  ProcessLaunchError,
  ProcessAbortError,
  ProcessTimeoutError,
  ProcessExitError,
  ProcessIOError,
  OutputLimitError,
  ProcessTeardownError,
} from './errors.js';

export type TerminationStatus =
  | { readonly kind: 'exited'; readonly code: number }
  | { readonly kind: 'signaled'; readonly signal: NodeJS.Signals };
export interface ExecutionResult<
  O extends OutputPolicy = OutputPolicy,
  E extends OutputPolicy = OutputPolicy,
> {
  readonly processIdentifier: number;
  readonly terminationStatus: TerminationStatus;
  readonly standardOutput: OutputValue<O>;
  readonly standardError: OutputValue<E>;
}

class Capture {
  private readonly chunks: Buffer[] = [];
  private size = 0;
  constructor(
    private readonly reader: Readable,
    private readonly policy: Extract<OutputPolicy, { kind: 'text' | 'bytes' }>,
    channel: 'stdout' | 'stderr',
    pid: number | undefined,
    fail: (error: ProcessError) => void,
    failed: () => boolean,
  ) {
    this.onData = (chunk: Buffer) => {
      if (failed()) return;
      if (this.size + chunk.length > policy.limit) {
        fail(new OutputLimitError(channel, policy.limit, pid));
        return;
      }
      this.size += chunk.length;
      this.chunks.push(chunk);
    };
    this.onError = (cause: Error) =>
      fail(
        pid === undefined ? new ProcessLaunchError(cause) : new ProcessIOError(channel, pid, cause),
      );
    reader.on('data', this.onData).on('error', this.onError);
  }
  private readonly onData: (chunk: Buffer) => void;
  private readonly onError: (cause: Error) => void;
  value(): string | Buffer {
    const bytes =
      this.chunks.length === 1 ? this.chunks[0]! : Buffer.concat(this.chunks, this.size);
    return this.policy.kind === 'text' ? bytes.toString('utf8') : bytes;
  }
  detach() {
    this.reader.off('data', this.onData).off('error', this.onError);
  }
}
const stdio = (policy: OutputPolicy) =>
  policy.kind === 'inherit' ? 'inherit' : policy.kind === 'discard' ? 'ignore' : 'pipe';
const emptyOptions = Object.freeze({});

type ExactOptions<O> = O & Record<Exclude<keyof O, keyof RunOptions>, never>;
type SelectedOutput<P> = Extract<P, OutputPolicy> | (undefined extends P ? InheritedOutput : never);
function run<Options extends RunOptions = RunOptions<InheritedOutput, InheritedOutput>>(
  cmd: Command,
  options: ExactOptions<Options> = emptyOptions as ExactOptions<Options>,
): Promise<ExecutionResult<SelectedOutput<Options['output']>, SelectedOutput<Options['error']>>> {
  return new Promise((resolve, reject) => {
    const config = settings(cmd, options);
    const { signal } = config;
    if (signal?.aborted) {
      reject(new ProcessAbortError(undefined, signal.reason));
      return;
    }
    let child: ChildProcess;
    // Validate byte views before launch; detached/proxied views must not leak a child.
    const input =
      typeof config.input === 'string'
        ? config.input
        : config.input instanceof Uint8Array
          ? Buffer.from(config.input.buffer, config.input.byteOffset, config.input.byteLength)
          : undefined;
    try {
      child = childProcess.spawn(cmd.executable, cmd.arguments as string[], {
        shell: false,
        cwd: config.cwd,
        env: childEnvironment(config.environment),
        stdio: [
          typeof config.input === 'object' && !(config.input instanceof Uint8Array)
            ? config.input.kind === 'inherit'
              ? 'inherit'
              : 'ignore'
            : 'pipe',
          stdio(config.output),
          stdio(config.error),
        ],
      });
    } catch (cause) {
      reject(new ProcessLaunchError(cause));
      return;
    }
    let primary: ProcessError | undefined;
    let closed = false,
      settled = false,
      inputClosed = child.stdin === null;
    let status: TerminationStatus | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let grace: ReturnType<typeof setTimeout> | undefined;
    let forced: ReturnType<typeof setTimeout> | undefined;
    let stdout: Capture | undefined, stderr: Capture | undefined;
    let abortListener: ReturnType<typeof addAbortListener> | undefined;
    const failed = () => primary !== undefined;
    const clearTimers = () => {
      clearTimeout(timeout);
      clearTimeout(grace);
      clearTimeout(forced);
    };
    const destroyIO = () => {
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
    };
    const cleanup = () => {
      clearTimers();
      abortListener?.[Symbol.dispose]();
      child.off('error', onError).off('exit', onExit).off('close', onClose);
      child.stdin?.off('error', onInputError).off('close', onInputClose);
      stdout?.detach();
      stderr?.detach();
    };
    const captured = (capture: Capture | undefined, stream: 'stdout' | 'stderr') => {
      try {
        return capture?.value();
      } catch (cause) {
        const error = new ProcessIOError(stream, child.pid, cause);
        if (primary) (primary.cleanupErrors as Error[]).push(error);
        else primary = error;
        return undefined;
      }
    };
    const finish = () => {
      if (settled || !closed || !inputClosed) return;
      settled = true;
      cleanup();
      const standardOutput = captured(stdout, 'stdout'),
        standardError = captured(stderr, 'stderr');
      if (primary) {
        Object.assign(primary, { terminationStatus: status, standardOutput, standardError });
        reject(primary);
      } else {
        const result = Object.freeze({
          processIdentifier: child.pid!,
          terminationStatus: status!,
          standardOutput,
          standardError,
        }) as ExecutionResult<SelectedOutput<Options['output']>, SelectedOutput<Options['error']>>;
        if (config.check && (status!.kind !== 'exited' || status!.code !== 0))
          reject(new ProcessExitError(result));
        else resolve(result);
      }
    };
    const secondary = (error: Error) => (primary!.cleanupErrors as Error[]).push(error);
    const kill = (signal: NodeJS.Signals) => {
      const errors = primary!.cleanupErrors.length;
      try {
        if (
          !child.kill(signal) &&
          child.exitCode === null &&
          child.signalCode === null &&
          child.pid !== undefined &&
          primary!.cleanupErrors.length === errors
        )
          secondary(new ProcessError('Subprocess termination signal failed', child.pid));
      } catch (cause) {
        secondary(new ProcessError('Subprocess termination signal failed', child.pid, { cause }));
      }
    };
    const fail = (error: ProcessError) => {
      if (settled) return;
      if (primary) {
        secondary(error);
        return;
      }
      primary = error;
      clearTimeout(timeout);
      if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
        destroyIO();
        return;
      }
      kill('SIGTERM');
      grace = setTimeout(() => {
        if (closed) return;
        kill('SIGKILL');
        destroyIO();
        forced = setTimeout(() => {
          if (closed) return;
          const alive = child.exitCode === null && child.signalCode === null;
          secondary(
            alive
              ? new ProcessTeardownError(child.pid!)
              : new ProcessError('Subprocess I/O did not close', child.pid),
          );
          Object.assign(primary!, {
            unresolvedProcessIdentifier: alive ? child.pid : undefined,
            standardOutput: captured(stdout, 'stdout'),
            standardError: captured(stderr, 'stderr'),
          });
          settled = true;
          cleanup();
          child.unref();
          reject(primary);
        }, config.killTimeoutMs);
        forced.unref();
      }, config.gracePeriodMs);
      grace.unref();
    };
    const onAbort = () => {
      if (!closed) fail(new ProcessAbortError(child.pid, signal!.reason));
    };
    const onError = (cause: Error) =>
      fail(
        child.pid === undefined
          ? new ProcessLaunchError(cause)
          : new ProcessError('Subprocess process control failed', child.pid, { cause }),
      );
    const onExit = () => {
      if (primary) destroyIO();
    };
    const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
      closed = true;
      clearTimers();
      if (child.pid !== undefined)
        status = Object.freeze(
          signal !== null ? { kind: 'signaled', signal } : { kind: 'exited', code: code! },
        );
      finish();
    };
    const onInputError = (cause: Error) =>
      fail(
        child.pid === undefined
          ? new ProcessLaunchError(cause)
          : new ProcessIOError('stdin', child.pid, cause),
      );
    const onInputClose = () => {
      inputClosed = true;
      finish();
    };
    child.on('error', onError).once('exit', onExit).once('close', onClose);
    if (child.stdout)
      stdout = new Capture(
        child.stdout,
        config.output as Extract<OutputPolicy, { kind: 'text' | 'bytes' }>,
        'stdout',
        child.pid,
        fail,
        failed,
      );
    if (child.stderr)
      stderr = new Capture(
        child.stderr,
        config.error as Extract<OutputPolicy, { kind: 'text' | 'bytes' }>,
        'stderr',
        child.pid,
        fail,
        failed,
      );
    if (child.stdin) {
      child.stdin.on('error', onInputError).once('close', onInputClose);
      try {
        child.stdin.end(input);
      } catch (cause) {
        fail(new ProcessIOError('stdin', child.pid, cause));
      }
    }
    if (signal) {
      if (signal.aborted) onAbort();
      else {
        try {
          abortListener = addAbortListener(signal, onAbort);
        } catch (cause) {
          fail(new ProcessError('Subprocess cancellation setup failed', child.pid, { cause }));
        }
      }
    }
    if (config.timeoutMs !== undefined && !primary) {
      timeout = setTimeout(
        () => fail(new ProcessTimeoutError(config.timeoutMs!, child.pid)),
        config.timeoutMs,
      );
      timeout.unref();
    }
  });
}
export const Subprocess = Object.freeze({ run });
