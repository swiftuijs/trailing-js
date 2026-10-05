import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { build, createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import twill from '../packages/twill/dist/vite.js';
import twillReact from '../packages/twill/dist/vite-react.js';
import { probeTypeScriptPlugin } from './probe-typescript-plugin.mjs';
import { npmConsumer as npm } from './npm-consumer.mjs';

const metadata = JSON.parse(readFileSync('packages/twill/package.json', 'utf8'));
const repository = JSON.parse(readFileSync('package.json', 'utf8'));
const packageRoot = resolve('packages/twill');
for (const entry of Object.values(metadata.exports)) {
  const paths = typeof entry === 'string' ? [entry] : Object.values(entry);
  for (const path of paths)
    assert(existsSync(resolve(packageRoot, path)), `Missing export ${path}`);
}
const root = mkdtempSync(join(tmpdir(), 'twill-package-'));
try {
  let archive = process.argv.includes('--packed')
    ? resolve(`swiftuijs-twill-${metadata.version}.tgz`)
    : process.env.TWILL_TEST_TARBALL && resolve(process.env.TWILL_TEST_TARBALL);
  if (!archive) {
    const [packed] = JSON.parse(
      npm(['pack', '--ignore-scripts', '--json', '--pack-destination', root], {
        cwd: packageRoot,
        encoding: 'utf8',
      }),
    );
    assert(
      !packed.files.some((file) => /\.vsix$|examples\/|tests\//.test(file.path)),
      'Unexpected files in npm tarball',
    );
    archive = join(root, packed.filename);
  }
  writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  npm(
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      archive,
      `react@${repository.devDependencies.react}`,
      `@types/react@${repository.devDependencies['@types/react']}`,
      `vue@${repository.devDependencies.vue}`,
      `vite@${repository.devDependencies.vite}`,
      `@vitejs/plugin-react@${repository.devDependencies['@vitejs/plugin-react']}`,
    ],
    {
      cwd: root,
      stdio: 'pipe',
    },
  );
  const base = join(root, 'node_modules/@swiftuijs/twill/dist');
  const installed = JSON.parse(readFileSync(join(base, '../package.json'), 'utf8'));
  assert.equal(installed.name, metadata.name);
  assert.equal(installed.version, metadata.version);
  for (const entry of Object.values(installed.exports))
    for (const path of typeof entry === 'string' ? [entry] : Object.values(entry))
      assert(existsSync(resolve(base, '..', path)), `Missing installed export ${path}`);
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
  // Vite loads native Rolldown bindings. Run this consumer in a child process
  // so Windows releases its DLL before the temporary installation is removed.
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import twillReact from '@swiftuijs/twill/vite-react';
    assert(twillReact().length >= 2, 'Installed optional React integration must load its peer');
    assert.throws(() => twillReact({react:{jsxRuntime:'classic'}}), /automatic JSX/);
  `,
    ],
    { cwd: root, stdio: 'pipe' },
  );
  assert.equal(transform('fn() { 42 }').closures, 1);
  assert.equal(transform('function f(v) { guard v else { return 0; } return 1; }').guards, 1);
  assert.equal(transform('function f() { defer { console.log("done"); } }').defers, 1);
  for (const name of [
    'vite',
    'rollup',
    'esbuild',
    'webpack',
    'rspack',
    'project',
    'editor',
    'doctor',
  ])
    await import(pathToFileURL(join(base, name + '.js')).href);
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        skipLibCheck: true,
      },
      include: ['*.twill'],
    }),
  );
  writeFileSync(
    join(root, 'main.twill'),
    'import {twice} from "./twice.twill"; export const values = [1,2].map() { x in defer {} guard x > 1 else { return 0; } return twice(x); };',
  );
  writeFileSync(
    join(root, 'twice.twill'),
    'export function twice(value: number) { defer {} return value*2; }',
  );
  execFileSync(process.execPath, [join(base, 'cli.js'), 'check', '-p', 'tsconfig.json'], {
    cwd: root,
    stdio: 'pipe',
  });
  const report = JSON.parse(
    execFileSync(
      process.execPath,
      [resolve(base, '..', installed.bin.twill), 'doctor', '-p', 'tsconfig.json', '--json'],
      { cwd: root, encoding: 'utf8' },
    ),
  );
  assert.equal(report.ok, true);
  assert.equal(report.twillVersion, metadata.version);
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
    join(root, 'react-view.twillx'),
    `
    import {createElement, useState} from 'react';
    export let calls = 0;
    function Card(props: {children?: import('react').ReactNode}) {
      calls++; const [value] = useState(1);
      return createElement('article', null, value, props.children);
    }
    export const view = Card { 'hello'; };
  `,
  );
  writeFileSync(
    join(root, 'vue-view.twillx'),
    `
    import {defineComponent} from 'vue';
    export let calls = 0;
    const Panel = defineComponent({props:{title:String}});
    function child() { calls++; return 'hello'; }
    export const view = Panel({title:'Vue'}) { child(); } footer: { 'footer'; };
  `,
  );
  writeFileSync(
    join(root, 'ui-entry.js'),
    `
    import {view as react, calls as reactCalls} from './react-view.twillx';
    import {view as vue, calls as vueCalls} from './vue-view.twillx';
    console.log(JSON.stringify({reactCalls, vueCalls, children:react.props.children,
      slot:vue.children.default(), footer:vue.children.footer(), after:vueCalls}));
  `,
  );
  const ui = execFileSync(
    process.execPath,
    ['--import', '@swiftuijs/twill/register', 'ui-entry.js'],
    { cwd: root, encoding: 'utf8' },
  );
  assert.deepEqual(JSON.parse(ui), {
    reactCalls: 0,
    vueCalls: 0,
    children: 'hello',
    slot: 'hello',
    footer: 'footer',
    after: 1,
  });
  writeFileSync(
    join(root, 'ui-consumer.twill'),
    'import {view} from "./react-view.twillx"; import {view as panel} from "./vue-view.twillx"; export const views = [view, panel];',
  );
  execFileSync(process.execPath, [join(base, 'cli.js'), 'check', '-p', 'tsconfig.json'], {
    cwd: root,
    stdio: 'pipe',
  });
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
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [resolve(base, '..', installed.bin.twill), 'doctor', '-p', 'tsconfig.json', '--json'],
        { cwd: root, stdio: 'pipe' },
      ),
    (error) => {
      assert.equal(error.status, 1, 'doctor must fail for an invalid project');
      const report = JSON.parse(String(error.stdout));
      assert.equal(report.ok, false);
      assert(report.diagnostics.some((diagnostic) => diagnostic.filename.endsWith('bad.twill')));
      return true;
    },
  );
  console.log('Independent package install, exports, CLI and Node loader passed.');
} finally {
  rmSync(root, { recursive: true, force: true });
}

for (const name of ['basic', 'general', 'defer', 'mixed', 'react', 'vue']) {
  execFileSync(
    process.execPath,
    ['packages/twill/dist/cli.js', 'check', '-p', `examples/${name}/tsconfig.json`],
    {
      stdio: 'pipe',
    },
  );
}
const general = JSON.parse(
  execFileSync(
    process.execPath,
    ['--import', pathToFileURL(resolve('packages/twill/dist/register.js')).href, 'run.mjs'],
    { cwd: resolve('examples/general'), encoding: 'utf8' },
  ),
);
assert.deepEqual(general.result, ['1. B: 30', '2. A: 12']);
assert.deepEqual(general.query, ['SELECT', 'id', 'name', 'FROM users', 'WHERE active = true']);
const cleanup = JSON.parse(
  execFileSync(
    process.execPath,
    ['--import', pathToFileURL(resolve('packages/twill/dist/register.js')).href, 'run.mjs'],
    { cwd: resolve('examples/defer'), encoding: 'utf8' },
  ),
);
assert.equal(cleanup.content, 'Hello from Twill');
assert.deepEqual(cleanup.events, ['file closed', 'body complete', 'directory removed']);
const mixed = JSON.parse(
  execFileSync(
    process.execPath,
    ['--import', pathToFileURL(resolve('packages/twill/dist/register.js')).href, 'main.js'],
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
      plugins: name === 'react' ? twillReact() : [twill()],
      build: { outDir, emptyOutDir: true, sourcemap: true },
    });
    if (name === 'react') {
      const { readdirSync } = await import('node:fs');
      const javascript = readdirSync(join(outDir, 'assets'))
        .filter((file) => file.endsWith('.js'))
        .map((file) => readFileSync(join(outDir, 'assets', file), 'utf8'))
        .join('\n');
      assert(
        !javascript.includes('/@react-refresh') && !javascript.includes('$RefreshReg$'),
        'Production bundles must exclude refresh instrumentation',
      );
    }
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
    const { default: App } = await server.ssrLoadModule('/App.twillx');
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
