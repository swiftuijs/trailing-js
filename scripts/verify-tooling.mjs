import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const version = JSON.parse(readFileSync('packages/twill/package.json', 'utf8')).version;
const root = mkdtempSync(join(tmpdir(), 'twill-tooling-consumer-'));
const run = (command, args) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 8 * 1024 * 1024,
  });
try {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  const archives = ['twill', 'twill-formatter', 'twill-linter'].map((name) =>
    resolve(`swiftuijs-${name}-${version}.tgz`),
  );
  run('npm', [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    ...archives,
    'prettier@3.9.9',
    'eslint@10.12.0',
  ]);
  writeFileSync(
    join(root, '.prettierrc.json'),
    JSON.stringify({ plugins: ['@swiftuijs/twill-formatter'] }),
  );
  writeFileSync(
    join(root, 'eslint.config.mjs'),
    `import twill from '@swiftuijs/twill-linter';export default twill.configs.recommended;`,
  );
  writeFileSync(join(root, 'main.twill'), 'export const doubled=[1,2,3].map { n in n*2 };\n');
  run('node', ['node_modules/prettier/bin/prettier.cjs', '--write', 'main.twill']);
  assert(readFileSync(join(root, 'main.twill'), 'utf8').includes('map { n in'));
  run('node', ['node_modules/eslint/bin/eslint.js', 'main.twill']);
  writeFileSync(
    join(root, 'consumer.mts'),
    `import formatter,{format} from '@swiftuijs/twill-formatter';
import linter,{configs} from '@swiftuijs/twill-linter';
import {emitDeclarations} from '@swiftuijs/twill/declarations';
void formatter;void format;void linter;void configs;void emitDeclarations;`,
  );
  run('node', [
    'node_modules/typescript/bin/tsc',
    '--noEmit',
    '--module',
    'nodenext',
    '--target',
    'es2022',
    'consumer.mts',
  ]);
  // Library declarations and generated JS must also work without a dialect-aware checker.
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        types: [],
      },
      include: ['main.twill'],
      exclude: ['dist'],
    }),
  );
  run('node', [
    'node_modules/@swiftuijs/twill/bin/twill.mjs',
    'declarations',
    '-p',
    'tsconfig.json',
  ]);
  writeFileSync(
    join(root, 'library-consumer.ts'),
    'import {doubled} from "./dist/main.js"; const result:number[]=doubled;',
  );
  run('node', [
    'node_modules/typescript/bin/tsc',
    '--noEmit',
    '--module',
    'nodenext',
    '--target',
    'es2022',
    'library-consumer.ts',
  ]);
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', 'eslint@9.39.5']);
  run('node', ['node_modules/eslint/bin/eslint.js', 'main.twill']);
  console.log(
    'Independent npm consumer: Prettier, ESLint, public tool types and native library declarations passed.',
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
