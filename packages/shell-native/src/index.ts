import { addAbortListener } from 'node:events';
import { constants } from 'node:os';
import { isAbsolute, win32 } from 'node:path';
import {
  ProcessError,
  ProcessLaunchError,
  ProcessAbortError,
  ProcessTimeoutError,
  ProcessExitError,
  ProcessIOError,
  OutputLimitError,
  ProcessTeardownError,
  type Command,
  type ExecutionResult,
  type TerminationStatus,
  type RunOptions,
  type OutputPolicy,
  type InheritedOutput,
} from '@swiftuijs/twill-shell';
import { settings, childEnvironment } from '@swiftuijs/twill-shell/backend';
import { loadBackend, type NativeFailure, type NativeOutcome } from './bindings.js';
export {
  Command,
  Environment,
  Input,
  Output,
  ProcessError,
  ProcessLaunchError,
  ProcessAbortError,
  ProcessTimeoutError,
  ProcessExitError,
  ProcessIOError,
  OutputLimitError,
  ProcessTeardownError,
} from '@swiftuijs/twill-shell';
export type {
  ExecutionResult,
  TerminationStatus,
  RunOptions,
  OutputPolicy,
  OutputValue,
  ProcessInput,
  InputPolicy,
  InheritedOutput,
  DiscardedOutput,
  TextOutput,
  ByteOutput,
} from '@swiftuijs/twill-shell';

type ExactOptions<O> = O & Record<Exclude<keyof O, keyof RunOptions>, never>;
type SelectedOutput<P> = Extract<P, OutputPolicy> | (undefined extends P ? InheritedOutput : never);
const emptyOptions = Object.freeze({});

function cause(failure: NativeFailure) {
  return Object.assign(new Error(failure.message), {
    code: failure.code,
    errno: failure.osCode,
  });
}
function run<Options extends RunOptions = RunOptions<InheritedOutput, InheritedOutput>>(
  command: Command,
  options: ExactOptions<Options> = emptyOptions as ExactOptions<Options>,
): Promise<ExecutionResult<SelectedOutput<Options['output']>, SelectedOutput<Options['error']>>> {
  return new Promise((resolve, reject) => {
    const config = settings(command, options);
    const { signal } = config;
    if (signal?.aborted) {
      reject(new ProcessAbortError(undefined, signal.reason));
      return;
    }
    const input =
      typeof config.input === 'string'
        ? Buffer.from(config.input)
        : config.input instanceof Uint8Array
          ? Buffer.from(config.input.buffer, config.input.byteOffset, config.input.byteLength)
          : undefined;
    const inputPolicy =
      typeof config.input === 'object' && !(config.input instanceof Uint8Array)
        ? config.input
        : undefined;
    let backend: ReturnType<typeof loadBackend>, job: ReturnType<typeof backend.start>;
    try {
      backend = loadBackend();
      job = backend.start({
        executable: command.executable,
        arguments: command.arguments,
        cwd:
          config.cwd === undefined
            ? process.cwd()
            : process.platform === 'win32'
              ? win32.resolve(config.cwd)
              : isAbsolute(config.cwd)
                ? config.cwd
                : `${process.cwd()}/${config.cwd}`,
        environment: { ...(childEnvironment(config.environment) ?? process.env) },
        input,
        inheritInput: inputPolicy?.kind === 'inherit',
        outputLimit: 'limit' in config.output ? config.output.limit : undefined,
        errorLimit: 'limit' in config.error ? config.error.limit : undefined,
        discardOutput: config.output.kind === 'discard',
        discardError: config.error.kind === 'discard',
        timeoutMs: config.timeoutMs,
        gracePeriodMs: config.gracePeriodMs,
        killTimeoutMs: config.killTimeoutMs,
      });
    } catch (error) {
      reject(new ProcessLaunchError(error));
      return;
    }
    let abortReason: unknown, setupFailure: unknown;
    let listener: ReturnType<typeof addAbortListener> | undefined;
    const abort = () => {
      abortReason = signal!.reason;
      backend.cancel(job.id, false);
    };
    if (signal) {
      if (signal.aborted) abort();
      else {
        try {
          listener = addAbortListener(signal, abort);
        } catch (error) {
          setupFailure = error;
          backend.cancel(job.id, true);
        }
      }
    }
    const failure = (value: NativeFailure, pid: number | undefined): ProcessError => {
      switch (value.kind) {
        case 'launch':
          return new ProcessLaunchError(cause(value));
        case 'abort':
          return new ProcessAbortError(pid, abortReason);
        case 'timeout':
          return new ProcessTimeoutError(config.timeoutMs!, pid);
        case 'io':
          return new ProcessIOError(value.stream!, pid, cause(value));
        case 'limit': {
          const policy = value.stream === 'stdout' ? config.output : config.error;
          return new OutputLimitError(
            value.stream as 'stdout' | 'stderr',
            (policy as { limit: number }).limit,
            pid,
          );
        }
        case 'teardown':
          return new ProcessTeardownError(pid!, cause(value));
        case 'setup':
          return new ProcessError('Subprocess cancellation setup failed', pid, {
            cause: setupFailure,
          });
        default:
          return new ProcessError(value.message, pid, { cause: cause(value) });
      }
    };
    const complete = (outcome: NativeOutcome) => {
      listener?.[Symbol.dispose]();
      const pid = outcome.processIdentifier;
      const terminationStatus: TerminationStatus | undefined =
        outcome.windowsSignal !== undefined
          ? Object.freeze({ kind: 'signaled', signal: outcome.windowsSignal })
          : outcome.signal !== undefined
            ? Object.freeze({
                kind: 'signaled',
                signal: Object.keys(constants.signals).find(
                  (key) => constants.signals[key as NodeJS.Signals] === outcome.signal,
                ) as NodeJS.Signals,
              })
            : outcome.code !== undefined
              ? Object.freeze({ kind: 'exited', code: outcome.code })
              : undefined;
      let primary = outcome.failure ? failure(outcome.failure, pid) : undefined;
      const secondary = outcome.cleanupErrors.map((value) => failure(value, pid));
      if (setupFailure !== undefined && outcome.failure?.kind !== 'setup') {
        const error = new ProcessError('Subprocess cancellation setup failed', pid, {
          cause: setupFailure,
        });
        if (primary) secondary.push(error);
        else primary = error;
      }
      const capture = (
        bytes: Buffer | undefined,
        policy: OutputPolicy,
        stream: 'stdout' | 'stderr',
      ) => {
        try {
          return policy.kind === 'text' ? bytes?.toString('utf8') : bytes;
        } catch (error) {
          const value = new ProcessIOError(stream, pid, error);
          if (primary) secondary.push(value);
          else primary = value;
          return undefined;
        }
      };
      const standardOutput = capture(outcome.standardOutput, config.output, 'stdout');
      const standardError = capture(outcome.standardError, config.error, 'stderr');
      if (primary) {
        (primary.cleanupErrors as Error[]).push(...secondary);
        Object.assign(primary, {
          terminationStatus,
          standardOutput,
          standardError,
          unresolvedProcessIdentifier: outcome.unresolvedProcessIdentifier,
        });
        reject(primary);
      } else {
        const result = Object.freeze({
          processIdentifier: pid!,
          terminationStatus: terminationStatus!,
          standardOutput,
          standardError,
        }) as ExecutionResult<SelectedOutput<Options['output']>, SelectedOutput<Options['error']>>;
        if (config.check && (terminationStatus!.kind !== 'exited' || terminationStatus!.code !== 0))
          reject(new ProcessExitError(result));
        else resolve(result);
      }
    };
    job.promise.then(complete).catch((error: unknown) => {
      listener?.[Symbol.dispose]();
      reject(new ProcessError('Native subprocess operation failed', undefined, { cause: error }));
    });
  });
}
export const Subprocess = Object.freeze({ run });
