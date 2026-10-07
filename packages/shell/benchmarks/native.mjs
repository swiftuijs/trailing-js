import { spawn } from 'node:child_process';
// Natural handwritten spawn coordination for the successful workloads being timed.
// It preserves the same argv/stdio, byte bounds, close ownership, decoding and result.
export function nativeRun(command, options = {}) {
  return new Promise((resolve, reject) => {
    const output = options.output,
      error = options.error;
    const io = (policy) =>
      policy?.kind === 'text' || policy?.kind === 'bytes'
        ? 'pipe'
        : policy?.kind === 'discard'
          ? 'ignore'
          : 'inherit';
    const child = spawn(command.executable, command.arguments, {
      shell: false,
      stdio: [options.input === undefined ? 'ignore' : 'pipe', io(output), io(error)],
    });
    let failure;
    const fail = (error) => {
      failure ??= error;
      child.kill('SIGKILL');
    };
    child.on('error', fail);
    child.stdin?.on('error', fail);
    function collect(reader, policy) {
      if (!reader) return () => undefined;
      const chunks = [];
      let size = 0;
      reader
        .on('data', (chunk) => {
          if (failure) return;
          if (size + chunk.length > policy.limit) {
            fail(Error('Output byte limit'));
            return;
          }
          size += chunk.length;
          chunks.push(chunk);
        })
        .on('error', fail);
      return () => {
        const bytes = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, size);
        return policy.kind === 'text' ? bytes.toString('utf8') : bytes;
      };
    }
    const stdout = collect(child.stdout, output),
      stderr = collect(child.stderr, error);
    child.once('close', (code, signal) => {
      if (failure) {
        reject(failure);
        return;
      }
      const terminationStatus = Object.freeze(
        signal !== null ? { kind: 'signaled', signal } : { kind: 'exited', code },
      );
      const result = Object.freeze({
        processIdentifier: child.pid,
        terminationStatus,
        standardOutput: stdout(),
        standardError: stderr(),
      });
      if (signal !== null || code !== 0) reject(Error('Nonzero status'));
      else resolve(result);
    });
    child.stdin?.end(options.input);
  });
}
