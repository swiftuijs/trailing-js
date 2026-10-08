import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { npmConsumer } from '../../twill/tests/helpers/npm-consumer.mjs';
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
const workspace = resolve(import.meta.dirname, '../../..');
const archive = resolve(workspace, `swiftuijs-twill-shell-native-${version}.tgz`);
const sdk = resolve(workspace, `swiftuijs-twill-shell-${version}.tgz`);
assert(
  statSync(archive).size <= 6 * 1024 * 1024,
  'Native archive exceeds its separate 6 MiB compressed budget',
);
const directory = mkdtempSync(resolve(tmpdir(), 'twill-native-consumer-'));
try {
  writeFileSync(
    resolve(directory, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  const options = { cwd: directory, stdio: 'pipe' };
  npmConsumer(
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      sdk,
      archive,
      'typescript@5.9.3',
      '@types/node@20',
    ],
    options,
  );
  writeFileSync(
    resolve(directory, 'test.mjs'),
    `
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Command,Output,Subprocess,ProcessExitError,ProcessAbortError,ProcessTimeoutError,OutputLimitError} from '@swiftuijs/twill-shell-native';
import {ProcessExitError as SharedError} from '@swiftuijs/twill-shell';
assert.equal(ProcessExitError,SharedError);
const args=['','a b','$(echo injected); & |','中文🪶'];
const result=await Subprocess.run(Command.path(process.execPath,['-e','process.stdout.write(JSON.stringify(process.argv.slice(1)))','--',...args]),{output:Output.text({limit:4096})});
assert.deepEqual(JSON.parse(result.standardOutput),args);
assert.deepEqual(result.terminationStatus,{kind:'exited',code:0});
const bytes=await Subprocess.run(Command.path(process.execPath,['-e','process.stdin.pipe(process.stdout)']),{input:Buffer.from([0,255,1]),output:Output.bytes({limit:3})});
assert.deepEqual(bytes.standardOutput,Buffer.from([0,255,1]));
await assert.rejects(Subprocess.run(Command.path(process.execPath,['-e','process.exitCode=7'])),ProcessExitError);
await assert.rejects(Subprocess.run(Command.path(process.execPath,['-e','process.stdout.write("overflow")']),{output:Output.text({limit:1})}),OutputLimitError);
await assert.rejects(Subprocess.run(Command.path(process.execPath,['-e','setInterval(()=>{},1000)']),{timeoutMs:100,gracePeriodMs:0}),ProcessTimeoutError);
const controller=new AbortController();controller.abort('cancel');
await assert.rejects(Subprocess.run(Command.path(process.execPath),{signal:controller.signal}),ProcessAbortError);
const require=createRequire(import.meta.url);assert.throws(()=>require.resolve('@swiftuijs/twill'),{code:'MODULE_NOT_FOUND'});
`,
  );
  execFileSync(process.execPath, ['test.mjs'], {
    ...options,
    env: { ...process.env, CARGO: 'unavailable', CARGO_HOME: resolve(directory, 'no-rust') },
  });
  writeFileSync(
    resolve(directory, 'installed-runtime.mjs'),
    readFileSync(new URL('./installed-runtime.mjs', import.meta.url)),
  );
  execFileSync(process.execPath, ['--test', 'installed-runtime.mjs'], {
    ...options,
    timeout: 90000,
    env: {
      ...process.env,
      UV_THREADPOOL_SIZE: '1',
      CARGO: 'unavailable',
      CARGO_HOME: resolve(directory, 'no-rust'),
    },
  });
  writeFileSync(
    resolve(directory, 'types.ts'),
    `
import {Command,Output,Subprocess,type RunOptions} from '@swiftuijs/twill-shell-native';
import {Command as SharedCommand} from '@swiftuijs/twill-shell';
const command=SharedCommand.path(process.execPath);
const text:string=(await Subprocess.run(command,{output:Output.text({limit:1})})).standardOutput;
const bytes:Buffer=(await Subprocess.run(command,{output:Output.bytes({limit:1})})).standardOutput;
const inherited:undefined=(await Subprocess.run(command)).standardOutput;
const optional:RunOptions<ReturnType<typeof Output.text>>={};
const maybe:string|undefined=(await Subprocess.run(command,optional)).standardOutput;
// @ts-expect-error no implicit shell
await Subprocess.run(command,{shell:true});
// @ts-expect-error immutable command arguments
command.arguments.push('no');
// @ts-expect-error explicit bounded capture
Output.text();
`,
  );
  execFileSync(
    process.execPath,
    [
      'node_modules/typescript/bin/tsc',
      '--noEmit',
      '--strict',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--target',
      'ES2022',
      'types.ts',
    ],
    options,
  );
  console.log(
    `Independent native consumer on ${process.platform}/${process.arch}, ${process.version}: real prebuilt, shared errors/types, literal argv, input, failures and no Rust/compiler installation verified.`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
