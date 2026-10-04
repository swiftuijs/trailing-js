import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

/** Exercise the real TS-server protocol, rather than a mocked language host. */
export async function probeTypeScriptPlugin(probeLocation, pluginName) {
  const require = createRequire(import.meta.url);
  const root = mkdtempSync(join(tmpdir(), 'twill-tsserver-'));
  const main = join(root, 'main.ts');
  const api = join(root, 'api.twill');
  const js = join(root, 'consumer.js');
  const source = 'import {label} from "./api.twill"; export const answer: string = label(2);';
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        checkJs: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
      },
      include: ['*.ts', '*.js'],
    }),
  );
  writeFileSync(
    api,
    'export function label(value: number): string { const run=(body:()=>string)=>body(); const values: number[] = [value]; return run() { values.map() { item in String(item) }.join(",") }; }',
  );
  writeFileSync(main, source);
  writeFileSync(js, 'import {label} from "./api.twill"; export const wrong = label("bad");');
  const child = spawn(
    process.execPath,
    [
      require.resolve('typescript/lib/tsserver.js'),
      '--logVerbosity',
      'verbose',
      '--logFile',
      join(root, 'server.log'),
      '--disableAutomaticTypingAcquisition',
      '--allowLocalPluginLoads',
      '--pluginProbeLocations',
      probeLocation,
      '--globalPlugins',
      pluginName,
    ],
    { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  let buffer = Buffer.alloc(0);
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const requests = new Map();
  let seq = 0;
  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const end = buffer.indexOf('\r\n\r\n');
      if (end < 0) break;
      const length = Number(
        buffer
          .subarray(0, end)
          .toString()
          .match(/Content-Length: (\d+)/)?.[1],
      );
      if (!length || buffer.length < end + 4 + length) break;
      const message = JSON.parse(buffer.subarray(end + 4, end + 4 + length).toString());
      buffer = buffer.subarray(end + 4 + length);
      if (message.type === 'response') {
        const request = requests.get(message.request_seq);
        if (request) {
          requests.delete(message.request_seq);
          clearTimeout(request.timer);
          if (message.success) request.resolve(message.body);
          else request.reject(new Error(message.message));
        }
      }
    }
  });
  const send = (command, args, response = true) => {
    const id = ++seq;
    const result = response
      ? new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`TS server timed out: ${command}\n${stderr}`)),
            20000,
          );
          requests.set(id, { resolve, reject, timer });
        })
      : undefined;
    child.stdin.write(
      JSON.stringify({ seq: id, type: 'request', command, arguments: args }) + '\n',
    );
    return result;
  };
  try {
    send('open', { file: main, fileContent: source }, false);
    const info = await send('quickinfo', {
      file: main,
      line: 1,
      offset: source.lastIndexOf('label') + 2,
    });
    assert.match(info.displayString, /label\(value: number\): string/);
    assert.deepEqual(await send('semanticDiagnosticsSync', { file: main }), []);
    assert.deepEqual(await send('semanticDiagnosticsSync', { file: api }), []);
    const definitions = await send('definition', {
      file: main,
      line: 1,
      offset: source.lastIndexOf('label') + 2,
    });
    assert.equal(definitions[0].file.replaceAll('\\', '/'), api.replaceAll('\\', '/'));
    assert.equal(definitions[0].start.line, 1);
    assert.equal(definitions[0].start.offset, 'export function '.length + 1);
    send('open', { file: js }, false);
    assert(
      (await send('semanticDiagnosticsSync', { file: js })).some(
        (diagnostic) => diagnostic.code === 2345,
      ),
    );
    // Unsaved native changes and Twill overlays must both update the bridge.
    send('close', { file: main }, false);
    send('open', { file: main, fileContent: source.replace(': string', ': number') }, false);
    assert(
      (await send('semanticDiagnosticsSync', { file: main })).some(
        (diagnostic) => diagnostic.code === 2322,
      ),
    );
    await send('configurePlugin', {
      pluginName,
      configuration: {
        overlays: {
          [api.replaceAll('\\', '/')]:
            'export function label(value: number): number { const run=(body:()=>number)=>body(); return run() { value }; }',
        },
      },
    });
    assert.deepEqual(await send('semanticDiagnosticsSync', { file: main }), []);
  } catch (error) {
    const log = readFileSync(join(root, 'server.log'), 'utf8')
      .split('\n')
      .filter((line) => /[Pp]lugin|Twill [a-z]|Exception/.test(line))
      .join('\n');
    throw new Error(error.message + '\n' + log);
  } finally {
    for (const request of requests.values()) clearTimeout(request.timer);
    child.kill();
    await new Promise((resolve) => child.once('close', resolve));
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
}
