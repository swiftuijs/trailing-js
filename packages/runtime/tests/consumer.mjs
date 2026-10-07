import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const version = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
const archive = resolve(import.meta.dirname, `../../../swiftuijs-twill-runtime-${version}.tgz`);
const directory = mkdtempSync(resolve(tmpdir(), 'twill-runtime-consumer-'));
try {
  writeFileSync(
    resolve(directory, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  const options = { cwd: directory, stdio: 'pipe', shell: process.platform === 'win32' };
  execFileSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', archive, 'typescript@5.9.3'],
    options,
  );
  writeFileSync(
    resolve(directory, 'test.mjs'),
    `
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {runDefers} from '@swiftuijs/twill-runtime/helpers/v1';
const require=createRequire(import.meta.url), events=[];
runDefers([()=>events.push(1),()=>events.push(2)]);
assert.deepEqual(events,[2,1]);
let threw=false;
try{runDefers([()=>{throw undefined;}]);}catch(error){threw=true;assert.equal(error,undefined);}
assert.equal(threw,true);
assert.throws(()=>require.resolve('@swiftuijs/twill'),{code:'MODULE_NOT_FOUND'});
const entry=require.resolve('@swiftuijs/twill-runtime/helpers/v1');
const code=readFileSync(entry,'utf8');
assert(!/from\\s+['"]|require\\(|node:/.test(code),'Runtime must have no dependencies');
`,
  );
  execFileSync(process.execPath, ['test.mjs'], options);
  writeFileSync(
    resolve(directory, 'types.ts'),
    `import {runDefers} from '@swiftuijs/twill-runtime/helpers/v1';\nconst cleanup: Array<() => unknown> | undefined = [()=>1];\nconst result: void = runDefers(cleanup);\nrunDefers(undefined);\n// @ts-expect-error callbacks are required\nrunDefers([1]);\n`,
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
    'Independent runtime consumer: ESM behavior, thrown undefined, native declarations and zero compiler dependencies verified.',
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
