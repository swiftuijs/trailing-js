import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { build, createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import trailing from '../dist/vite.js';

const npm = (args, options = {}) =>
  execFileSync(process.execPath, [process.env.npm_execpath, ...args], options);
const metadata = JSON.parse(readFileSync('package.json', 'utf8'));
for (const entry of Object.values(metadata.exports)) {
  const paths = typeof entry === 'string' ? [entry] : Object.values(entry);
  for (const path of paths) assert(existsSync(path), `Missing export ${path}`);
}
const root = mkdtempSync(join(tmpdir(), 'trailing-package-'));
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
  const base = join(root, 'node_modules/@swiftuijs/trailing-js/dist');
  const { transform } = await import(pathToFileURL(join(base, 'index.js')).href);
  assert.equal(transform('fn() { 42 }').closures, 1);
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
      include: ['*.tts'],
    }),
  );
  writeFileSync(join(root, 'main.tts'), 'export const values = [1,2].map() { x in x*2 };');
  execFileSync(process.execPath, [join(base, 'cli.js'), 'check', '-p', 'tsconfig.json'], {
    cwd: root,
    stdio: 'pipe',
  });
  const output = execFileSync(
    process.execPath,
    [
      '--enable-source-maps',
      '--import',
      pathToFileURL(join(base, 'register.js')).href,
      '--input-type=module',
      '-e',
      'import {values} from "./main.tts"; console.log(JSON.stringify(values))',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  assert.equal(output.trim(), '[2,4]');
  writeFileSync(join(root, 'bad.tts'), 'export const x: string = [1].map() { n in n*2 };');
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

for (const name of ['basic', 'react', 'vue']) {
  execFileSync(process.execPath, ['dist/cli.js', 'check', '-p', `examples/${name}/tsconfig.json`], {
    stdio: 'pipe',
  });
}
for (const name of ['react', 'vue']) {
  const root = resolve(`examples/${name}`);
  const outDir = mkdtempSync(join(tmpdir(), `trailing-${name}-`));
  try {
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [trailing()],
      build: { outDir, emptyOutDir: true, sourcemap: true },
    });
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
  const server = await createServer({
    root,
    configFile: false,
    plugins: [trailing()],
    ssr: { noExternal: name === 'react' ? ['@swiftuijs/ui'] : [] },
    server: { middlewareMode: true },
  });
  try {
    const { default: App } = await server.ssrLoadModule('/App.tts');
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
