import assert from 'node:assert/strict';
import { build, createServer } from 'vite';
import twill from '@swiftuijs/twill/vite';
import twillReact from '@swiftuijs/twill/vite-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const root = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), 'twill-example-react-'));
try {
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: twillReact(),
    build: { outDir, emptyOutDir: true, sourcemap: true },
  });
  const javascript = readdirSync(join(outDir, 'assets'))
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFileSync(join(outDir, 'assets', file), 'utf8'))
    .join('\n');
  assert(
    !javascript.includes('/@react-refresh') && !javascript.includes('$RefreshReg$'),
    'Production bundles must exclude refresh instrumentation',
  );
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
const server = await createServer({
  root,
  configFile: false,
  plugins: [twill()],
  ssr: { noExternal: ['@swiftuijs/ui'] },
  server: { middlewareMode: true },
});
try {
  const { default: App } = await server.ssrLoadModule('/App.twillx');
  const { createElement } = await import('react');
  const html = renderToStaticMarkup(createElement(App));
  assert.match(html, /Count: 0/);
  assert.match(html, /Increment/);
} finally {
  await server.close();
}
console.log('react example: production build and real component rendering passed.');
