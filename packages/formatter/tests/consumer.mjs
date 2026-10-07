import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { npmConsumer as npm } from '../../twill/tests/helpers/npm-consumer.mjs';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const version = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
const root = mkdtempSync(join(tmpdir(), 'twill-formatter-consumer-'));
const run = (args) =>
  execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
try {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  npm(
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      resolve(repository, `swiftuijs-twill-${version}.tgz`),
      resolve(repository, `swiftuijs-twill-formatter-${version}.tgz`),
      'prettier@3.9.9',
    ],
    { cwd: root, stdio: 'pipe' },
  );
  writeFileSync(
    join(root, 'main.twill'),
    'export enum State{case loaded(value:number);}export function read(input:State){return switch(input){case enum State.loaded({value}):value;};}export const doubled=[1,2,3].map { n in n*2 };export function optional(input:number|null){if const value=input{return value;}return 0;}\n',
  );
  writeFileSync(
    join(root, '.prettierrc.json'),
    JSON.stringify({ plugins: ['@swiftuijs/twill-formatter'] }),
  );
  run(['node_modules/prettier/bin/prettier.cjs', '--write', 'main.twill']);
  const formatted = readFileSync(join(root, 'main.twill'), 'utf8');
  assert(formatted.includes('map { n in'));
  assert(formatted.includes('case enum State.loaded({ value })'));
  assert(formatted.includes('if const value = input'));
  run(['node_modules/prettier/bin/prettier.cjs', '--check', 'main.twill']);
  const generated = run([
    '--input-type=module',
    '-e',
    'import {formatGenerated} from "@swiftuijs/twill-formatter"; console.log(await formatGenerated("const result:number=42;",{filepath:"result.ts"}));',
  ]);
  assert(generated.includes('const result: number = 42;'));
  const standalone = run([
    '--input-type=module',
    '-e',
    'import {format,formatGenerated} from "@swiftuijs/twill-formatter/standalone"; console.log(await format("const x=[1].map { n in n*2 };")); console.log(await formatGenerated("const y:number=42;"));',
  ]);
  assert(standalone.includes('map { n in'));
  assert(standalone.includes('const y: number = 42;'));
  writeFileSync(
    join(root, 'consumer.mts'),
    `import formatter,{format,formatGenerated} from '@swiftuijs/twill-formatter'; import * as standalone from '@swiftuijs/twill-formatter/standalone'; void formatter; void format; void formatGenerated; void standalone;`,
  );
  run([
    'node_modules/typescript/bin/tsc',
    '--noEmit',
    '--module',
    'nodenext',
    '--target',
    'es2022',
    'consumer.mts',
  ]);

  console.log(
    'Independent npm consumer: Prettier CLI, idempotence and public formatter types passed.',
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
