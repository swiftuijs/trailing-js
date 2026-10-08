import { createRequire } from 'node:module';
import { constants } from 'node:os';

const { run } = createRequire(import.meta.url)('./experiment.node');
const allowed = new Set(['input', 'output', 'error', 'cwd', 'environment', 'timeoutMs', 'check']);

// This adapter is not exported by @swiftuijs/twill-shell. It only compares the
// specified experimental subset; never silently ignores unsupported SDK options.
export async function rustRun(command, options = {}) {
  for (const key of Object.keys(options))
    if (!allowed.has(key)) throw Error(`Unsupported experimental option: ${key}`);
  const input = options.input;
  if (input !== undefined && typeof input !== 'string' && !(input instanceof Uint8Array))
    throw Error('Experimental input requires text or bytes');
  function policy(value) {
    if (value === undefined || value.kind === 'inherit') return {};
    if (value.kind === 'discard') return { discard: true };
    if (
      !['text', 'bytes'].includes(value.kind) ||
      !Number.isInteger(value.limit) ||
      value.limit <= 0 ||
      value.limit > 64 * 1024 * 1024
    )
      throw Error('Invalid experimental output policy');
    return { limit: value.limit, text: value.kind === 'text' };
  }
  const output = policy(options.output),
    error = policy(options.error);
  if (
    options.timeoutMs !== undefined &&
    (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 60000)
  )
    throw Error('Invalid experimental deadline');
  const environment = options.environment;
  if (environment !== undefined && environment.kind !== 'replace')
    throw Error('Experimental environment must explicitly replace values');
  const result = await run({
    executable: command.executable,
    arguments: command.arguments,
    cwd: options.cwd,
    environment: environment?.values,
    input:
      input === undefined
        ? undefined
        : typeof input === 'string'
          ? Buffer.from(input)
          : Buffer.from(input.buffer, input.byteOffset, input.byteLength),
    outputLimit: output.limit,
    errorLimit: error.limit,
    discardOutput: output.discard ?? false,
    discardError: error.discard ?? false,
    timeoutMs: options.timeoutMs ?? 5000,
  });
  const terminationStatus =
    result.signal === undefined
      ? { kind: 'exited', code: result.code }
      : {
          kind: 'signaled',
          signal: Object.keys(constants.signals).find(
            (key) => constants.signals[key] === result.signal,
          ),
        };
  const value = Object.freeze({
    processIdentifier: result.processIdentifier,
    terminationStatus: Object.freeze(terminationStatus),
    standardOutput: output.text ? result.standardOutput.toString('utf8') : result.standardOutput,
    standardError: error.text ? result.standardError.toString('utf8') : result.standardError,
  });
  if (
    options.check !== false &&
    (terminationStatus.kind !== 'exited' || terminationStatus.code !== 0)
  )
    throw Error('Nonzero experimental status');
  return value;
}
