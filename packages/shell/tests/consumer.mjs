import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const version = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
const archive = resolve(import.meta.dirname, `../../../swiftuijs-twill-shell-${version}.tgz`);
const directory = mkdtempSync(resolve(tmpdir(), 'twill-shell-consumer-'));
try {
  writeFileSync(
    resolve(directory, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  const options = { cwd: directory, stdio: 'pipe', shell: process.platform === 'win32' };
  execFileSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
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
import {readFileSync} from 'node:fs';
import {Command,Output,Environment,Subprocess,ProcessExitError,OutputLimitError,ProcessTimeoutError} from '@swiftuijs/twill-shell';
const require=createRequire(import.meta.url);
const args=['','a b','$(echo injected); & |','line\\nbreak','中文🪶'];
const command=Command.path(process.execPath,['-e','process.stdout.write(JSON.stringify(process.argv.slice(1)))','--',...args]);
const result=await Subprocess.run(command,{output:Output.text({limit:4096})});
assert.deepEqual(JSON.parse(result.standardOutput),args);
assert.deepEqual(result.terminationStatus,{kind:'exited',code:0});
const bytes=await Subprocess.run(Command.path(process.execPath,['-e','process.stdin.pipe(process.stdout)']),{input:Buffer.from([0,255,1]),output:Output.bytes({limit:3})});
assert.deepEqual(bytes.standardOutput,Buffer.from([0,255,1]));
await assert.rejects(Subprocess.run(Command.path(process.execPath,['-e','process.exitCode=7'])),ProcessExitError);
await assert.rejects(Subprocess.run(Command.path(process.execPath,['-e','process.stdout.write("overflow")']),{output:Output.text({limit:1})}),OutputLimitError);
await assert.rejects(Subprocess.run(Command.path(process.execPath,['-e','setInterval(()=>{},1000)']),{timeoutMs:100}),ProcessTimeoutError);
const env=await Subprocess.run(Command.path(process.execPath,['-e','process.stdout.write(process.env.VALUE)']),{environment:Environment.replace({VALUE:'isolated'}),output:Output.text({limit:20})});assert.equal(env.standardOutput,'isolated');
assert.throws(()=>require.resolve('@swiftuijs/twill'),{code:'MODULE_NOT_FOUND'});
const entry=new URL(import.meta.resolve('@swiftuijs/twill-shell'));
const code=readFileSync(entry,'utf8');assert(code.includes('shell: false'));assert(!code.includes('@swiftuijs/twill/register'));
const manifest=JSON.parse(readFileSync(new URL('../package.json',entry),'utf8'));
assert.equal(manifest.dependencies,undefined);
`,
  );
  execFileSync(process.execPath, ['test.mjs'], options);
  writeFileSync(
    resolve(directory, 'types.ts'),
    `
import {Command,Output,Subprocess,type RunOptions} from '@swiftuijs/twill-shell';
const command=Command.path(process.execPath);
const text:string=(await Subprocess.run(command,{output:Output.text({limit:1})})).standardOutput;
const bytes:Buffer=(await Subprocess.run(command,{output:Output.bytes({limit:1})})).standardOutput;
const inherited:undefined=(await Subprocess.run(command)).standardOutput;
const optional:RunOptions<ReturnType<typeof Output.text>>={};
const maybe:string|undefined=(await Subprocess.run(command,optional)).standardOutput;
// @ts-expect-error capture is explicit and bounded
Output.text();
// @ts-expect-error readonly snapshots
command.arguments.push('no');
// @ts-expect-error no implicit shell
await Subprocess.run(command,{shell:true});
// @ts-expect-error no shell switch alongside valid settings
await Subprocess.run(command,{output:Output.text({limit:1}),shell:true});
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
    `Independent shell consumer on ${process.version}: literal argv, binary stdin, errors, teardown, native declarations and zero compiler dependencies verified.`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
