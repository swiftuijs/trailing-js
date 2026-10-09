import { isAbsolute } from 'node:path';
import { constants } from 'node:buffer';

const commandBrand = Symbol.for('@swiftuijs/twill-shell/command/v1');
const environmentBrand = Symbol.for('@swiftuijs/twill-shell/environment/v1');
const outputBrand = Symbol.for('@swiftuijs/twill-shell/output/v1');
const inputBrand = Symbol.for('@swiftuijs/twill-shell/input/v1');

export interface Command {
  readonly [commandBrand]: true;
  readonly executable: string;
  readonly arguments: readonly string[];
}
function string(value: unknown, label: string, empty = false): asserts value is string {
  if (typeof value !== 'string' || (!empty && value.length === 0) || value.includes('\0'))
    throw new TypeError(`${label} must be a ${empty ? '' : 'nonempty '}string without NUL`);
}
function command(executable: string, args: readonly string[]): Command {
  if (!Array.isArray(args)) throw new TypeError('arguments must be an array of strings');
  const snapshot = Array.from(args);
  for (const arg of snapshot) string(arg, 'argument', true);
  return Object.freeze({
    [commandBrand]: true as const,
    executable,
    arguments: Object.freeze(snapshot),
  });
}
export const Command = Object.freeze({
  name(executable: string, args: readonly string[] = []): Command {
    string(executable, 'executable');
    if (/[\\/:]/.test(executable))
      throw new TypeError('Command.name requires a name without path separators');
    return command(executable, args);
  },
  path(executable: string, args: readonly string[] = []): Command {
    string(executable, 'executable');
    if (!isAbsolute(executable)) throw new TypeError('Command.path requires an absolute path');
    return command(executable, args);
  },
});

export interface Environment {
  readonly [environmentBrand]: true;
  readonly kind: 'inherit' | 'replace';
  readonly values: Readonly<Record<string, string | undefined>>;
}
function environment(
  kind: Environment['kind'],
  values: Record<string, string | undefined>,
): Environment {
  if (!values || typeof values !== 'object' || Array.isArray(values))
    throw new TypeError('environment values must be an object');
  const snapshot: Record<string, string | undefined> = Object.create(null);
  for (const [key, value] of Object.entries(values)) {
    string(key, 'environment key');
    if (key.includes('=')) throw new TypeError('environment key cannot contain =');
    if (value !== undefined) string(value, 'environment value', true);
    snapshot[key] = value;
  }
  return Object.freeze({
    [environmentBrand]: true as const,
    kind,
    values: Object.freeze(snapshot),
  });
}
export const Environment = Object.freeze({
  inherit(updates: Record<string, string | undefined> = {}): Environment {
    return environment('inherit', updates);
  },
  replace(values: Record<string, string | undefined>): Environment {
    return environment('replace', values);
  },
});

interface OutputBrand {
  readonly [outputBrand]: true;
}
export interface InheritedOutput extends OutputBrand {
  readonly kind: 'inherit';
}
export interface DiscardedOutput extends OutputBrand {
  readonly kind: 'discard';
}
export interface TextOutput extends OutputBrand {
  readonly kind: 'text';
  readonly limit: number;
}
export interface ByteOutput extends OutputBrand {
  readonly kind: 'bytes';
  readonly limit: number;
}
export type OutputPolicy = InheritedOutput | DiscardedOutput | TextOutput | ByteOutput;
export type OutputValue<P extends OutputPolicy> = P extends TextOutput
  ? string
  : P extends ByteOutput
    ? Buffer
    : undefined;
const inheritedOutput: InheritedOutput = Object.freeze({
  [outputBrand]: true as const,
  kind: 'inherit',
});
const discardedOutput: DiscardedOutput = Object.freeze({
  [outputBrand]: true as const,
  kind: 'discard',
});
function captureLimit(limit: number) {
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > constants.MAX_LENGTH)
    throw new TypeError('output limit must be a positive safe byte count within Buffer.MAX_LENGTH');
}
function capture<K extends 'text' | 'bytes'>(kind: K, options: { limit: number }) {
  const limit = options?.limit;
  captureLimit(limit);
  return Object.freeze({ [outputBrand]: true as const, kind, limit });
}
export const Output = Object.freeze({
  inherit(): InheritedOutput {
    return inheritedOutput;
  },
  discard(): DiscardedOutput {
    return discardedOutput;
  },
  text(options: { limit: number }): TextOutput {
    return capture('text', options);
  },
  bytes(options: { limit: number }): ByteOutput {
    return capture('bytes', options);
  },
});

export interface InputPolicy {
  readonly [inputBrand]: true;
  readonly kind: 'none' | 'inherit';
}
const noInput: InputPolicy = Object.freeze({ [inputBrand]: true as const, kind: 'none' });
const inheritedInput: InputPolicy = Object.freeze({ [inputBrand]: true as const, kind: 'inherit' });
export const Input = Object.freeze({
  none(): InputPolicy {
    return noInput;
  },
  inherit(): InputPolicy {
    return inheritedInput;
  },
});
export type ProcessInput = string | Uint8Array | InputPolicy;

export interface RunOptions<
  O extends OutputPolicy = OutputPolicy,
  E extends OutputPolicy = OutputPolicy,
> {
  readonly cwd?: string;
  readonly environment?: Environment;
  readonly input?: ProcessInput;
  readonly output?: O;
  readonly error?: E;
  readonly check?: boolean;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  /** Time allowed after SIGTERM, before SIGKILL. Defaults to 250 ms. */
  readonly gracePeriodMs?: number;
  /** Maximum join time after forced termination. Defaults to 1000 ms. */
  readonly killTimeoutMs?: number;
}
const optionKeys = new Set([
  'cwd',
  'environment',
  'input',
  'output',
  'error',
  'check',
  'signal',
  'timeoutMs',
  'gracePeriodMs',
  'killTimeoutMs',
]);
function duration(value: number, label: string, minimum: number) {
  if (!Number.isInteger(value) || value < minimum || value > 2147483647)
    throw new TypeError(`${label} must be an integer between ${minimum} and 2147483647`);
}
export function settings(cmd: Command, options: RunOptions) {
  if (!cmd || cmd[commandBrand] !== true) throw new TypeError('Use Command.name or Command.path');
  if (!options || typeof options !== 'object' || Array.isArray(options))
    throw new TypeError('run options must be an object');
  for (const key of Object.keys(options))
    if (!optionKeys.has(key)) throw new TypeError(`Unknown run option: ${key}`);
  const {
    cwd,
    environment: env,
    input = noInput,
    output = inheritedOutput,
    error = inheritedOutput,
    check = true,
    signal,
    timeoutMs,
    gracePeriodMs = 250,
    killTimeoutMs = 1000,
  } = options;
  if (cwd !== undefined) string(cwd, 'cwd');
  if (env !== undefined && (!env || env[environmentBrand] !== true))
    throw new TypeError('Use Environment.inherit or Environment.replace');
  if (!output || output[outputBrand] !== true || !error || error[outputBrand] !== true)
    throw new TypeError('Use Output policies');
  for (const policy of [output, error]) {
    if (policy.kind === 'text' || policy.kind === 'bytes') captureLimit(policy.limit);
    else if (policy.kind !== 'inherit' && policy.kind !== 'discard')
      throw new TypeError('Unknown output policy');
  }
  if (
    typeof input !== 'string' &&
    !(input instanceof Uint8Array) &&
    (!input || input[inputBrand] !== true)
  )
    throw new TypeError('input must be a string, Uint8Array or Input policy');
  if (typeof check !== 'boolean') throw new TypeError('check must be a boolean');
  if (signal !== undefined && !(signal instanceof AbortSignal))
    throw new TypeError('signal must be an AbortSignal');
  if (timeoutMs !== undefined) duration(timeoutMs, 'timeoutMs', 1);
  duration(gracePeriodMs, 'gracePeriodMs', 0);
  duration(killTimeoutMs, 'killTimeoutMs', 1);
  return {
    cwd,
    environment: env,
    input,
    output,
    error,
    check,
    signal,
    timeoutMs,
    gracePeriodMs,
    killTimeoutMs,
  };
}
/** Internal helper; parameter permits testing Windows key behavior on other hosts. */
export function childEnvironment(
  policy: Environment | undefined,
  platform = process.platform,
): NodeJS.ProcessEnv | undefined {
  if (policy === undefined) return undefined;
  const env: NodeJS.ProcessEnv = Object.assign(
    Object.create(null),
    policy.kind === 'inherit' ? process.env : undefined,
  );
  if (platform === 'win32') {
    const keys = new Map<string, string>();
    for (const key of Object.keys(env)) {
      const normalized = key.toUpperCase();
      const previous = keys.get(normalized);
      if (previous !== undefined) delete env[previous];
      keys.set(normalized, key);
    }
    for (const [key, value] of Object.entries(policy.values)) {
      const normalized = key.toUpperCase();
      const previous = keys.get(normalized);
      if (previous !== undefined) delete env[previous];
      keys.set(normalized, key);
      if (value !== undefined) env[key] = value;
    }
  } else {
    for (const [key, value] of Object.entries(policy.values)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
  return env;
}
