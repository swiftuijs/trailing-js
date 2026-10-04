import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { build, createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import twill from '../dist/vite.js';
import { probeTypeScriptPlugin } from './probe-typescript-plugin.mjs';

const npm = (args, options = {}) =>
  execFileSync(process.execPath, [process.env.npm_execpath, ...args], options);
const metadata = JSON.parse(readFileSync('package.json', 'utf8'));
for (const entry of Object.values(metadata.exports)) {
  const paths = typeof entry === 'string' ? [entry] : Object.values(entry);
  for (const path of paths) assert(existsSync(path), `Missing export ${path}`);
}
const root = mkdtempSync(join(tmpdir(), 'twill-package-'));
try {
  const [packed] = JSON.parse(
    npm(['pack', '--ignore-scripts', '--json', '--pack-destination', root], { encoding: 'utf8' }),
  );
  assert(
    !packed.files.some((file) => /\.vsix$|examples\/|tests\//.test(file.path)),
    'Unexpected files in npm tarball',
  );
  writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', join(root, packed.filename)], {
    cwd: root,
    stdio: 'pipe',
  });
  const base = join(root, 'node_modules/@swiftuijs/twill/dist');
  await probeTypeScriptPlugin(root, '@swiftuijs/twill');
  const esm = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      'import {transform} from "@swiftuijs/twill"; console.log(transform("fn() { 42 }").closures)',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(esm.trim(), '1', 'The TS-server main entry must preserve compiler ESM exports');
  const { transform } = await import(pathToFileURL(join(base, 'index.js')).href);
  assert.equal(transform('fn() { 42 }').closures, 1);
  assert.equal(transform('function f(v) { guard v else { return 0; } return 1; }').guards, 1);
  assert.equal(transform('function f() { defer { console.log("done"); } }').defers, 1);
  for (const name of ['vite', 'rollup', 'esbuild', 'webpack', 'rspack', 'project'])
    await import(pathToFileURL(join(base, name + '.js')).href);
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
      },
      include: ['*.twill'],
    }),
  );
  writeFileSync(
    join(root, 'main.twill'),
    'import {twice} from "./twice.twill.js"; export const values = [1,2].map() { x in defer {} guard x > 1 else { return 0; } return twice(x); };',
  );
  writeFileSync(
    join(root, 'twice.twill.js'),
    'export function twice(value) { defer {} return value*2; }',
  );
  execFileSync(process.execPath, [join(base, 'cli.js'), 'check', '-p', 'tsconfig.json'], {
    cwd: root,
    stdio: 'pipe',
  });
  const output = execFileSync(
    process.execPath,
    [
      '--enable-source-maps',
      '--import',
      '@swiftuijs/twill/register',
      '--input-type=module',
      '-e',
      'import {values} from "./main.twill"; console.log(JSON.stringify(values))',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(output.trim(), '[0,4]');
  writeFileSync(
    join(root, 'state.ts'),
    'import {read} from "./cycle.twill"; export let count: number = 1; export function increment() { count++; } export const get = () => read();',
  );
  writeFileSync(
    join(root, 'cycle.twill'),
    'import {count} from "./state.ts"; export function read(): number { const run=(body:()=>number)=>body(); return run() { count }; }',
  );
  writeFileSync(join(root, 'bridge.js'), 'export {get, increment} from "./state.ts";');
  writeFileSync(
    join(root, 'entry.ts'),
    'import {get, increment} from "./bridge.js"; export const values: number[] = [get()]; increment(); values.push(get()); export const dynamic = (await import("./main.twill")).values;',
  );
  const interop = execFileSync(
    process.execPath,
    [
      '--enable-source-maps',
      '--import',
      pathToFileURL(join(base, 'register.js')).href,
      '--input-type=module',
      '-e',
      'import {values, dynamic} from "./entry.ts"; console.log(JSON.stringify({values, dynamic}))',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  assert.deepEqual(JSON.parse(interop), { values: [1, 2], dynamic: [0, 4] });
  writeFileSync(
    join(root, 'thrower.ts'),
    'export function fail(): never {\n  const value: number = 1;\n  throw new Error("mapped native failure " + value);\n}\n',
  );
  writeFileSync(
    join(root, 'thrower.twill'),
    'import {fail} from "./thrower.ts"; const run=(body:()=>never)=>body(); run() { fail() };',
  );
  try {
    execFileSync(
      process.execPath,
      [
        '--enable-source-maps',
        '--import',
        pathToFileURL(join(base, 'register.js')).href,
        'thrower.twill',
      ],
      { cwd: root, stdio: 'pipe' },
    );
    assert.fail('Expected mapped native error');
  } catch (error) {
    assert.match(String(error.stderr), /thrower\.ts:3:/);
    assert.match(String(error.stderr), /thrower\.twill:1:/);
  }
  writeFileSync(join(root, 'bad.twill'), 'export const x: string = [1].map() { n in n*2 };');
  let status = 0;
  try {
    execFileSync(process.execPath, [join(base, 'cli.js'), 'check', '-p', 'tsconfig.json'], {
      cwd: root,
      stdio: 'pipe',
    });
  } catch (error) {
    status = error.status;
  }
  assert.equal(status, 1, 'Type errors must cause a failing exit status');
  console.log('Independent package install, exports, CLI and Node loader passed.');
} finally {
  rmSync(root, { recursive: true, force: true });
}

for (const name of ['basic', 'general', 'defer', 'mixed', 'react', 'vue']) {
  execFileSync(process.execPath, ['dist/cli.js', 'check', '-p', `examples/${name}/tsconfig.json`], {
    stdio: 'pipe',
  });
}
const general = JSON.parse(
  execFileSync(
    process.execPath,
    ['--import', pathToFileURL(resolve('dist/register.js')).href, 'run.mjs'],
    { cwd: resolve('examples/general'), encoding: 'utf8' },
  ),
);
assert.deepEqual(general.result, ['1. B: 30', '2. A: 12']);
assert.deepEqual(general.query, ['SELECT', 'id', 'name', 'FROM users', 'WHERE active = true']);
const cleanup = JSON.parse(
  execFileSync(
    process.execPath,
    ['--import', pathToFileURL(resolve('dist/register.js')).href, 'run.mjs'],
    { cwd: resolve('examples/defer'), encoding: 'utf8' },
  ),
);
assert.equal(cleanup.content, 'Hello from Twill');
assert.deepEqual(cleanup.events, ['file closed', 'body complete', 'directory removed']);
const mixed = JSON.parse(
  execFileSync(
    process.execPath,
    ['--import', pathToFileURL(resolve('dist/register.js')).href, 'main.js'],
    { cwd: resolve('examples/mixed'), encoding: 'utf8' },
  ),
);
assert.deepEqual(mixed, { summaries: ['Ada: 12', 'Lin: 9'], status: 'status: active' });
for (const name of ['react', 'vue']) {
  const root = resolve(`examples/${name}`);
  const outDir = mkdtempSync(join(tmpdir(), `twill-${name}-`));
  try {
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [twill()],
      build: { outDir, emptyOutDir: true, sourcemap: true },
    });
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
  const server = await createServer({
    root,
    configFile: false,
    plugins: [twill()],
    ssr: { noExternal: name === 'react' ? ['@swiftuijs/ui'] : [] },
    server: { middlewareMode: true },
  });
  try {
    const { default: App } = await server.ssrLoadModule('/App.twill');
    if (name === 'react') {
      const { createElement } = await import('react');
      const html = renderToStaticMarkup(createElement(App));
      assert.match(html, /Count: 0/);
      assert.match(html, /Increment/);
    } else {
      const { createSSRApp } = await import('vue');
      const { renderToString } = await import('@vue/server-renderer');
      const html = await renderToString(createSSRApp(App));
      assert.match(html, /Count: 0/);
      assert.match(html, /Increment/);
    }
  } finally {
    await server.close();
  }
}
console.log('All examples typechecked, React/Vue builds and real component rendering passed.');
