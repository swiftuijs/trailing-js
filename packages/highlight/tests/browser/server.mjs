import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('.twill/browser');
mkdirSync(root, { recursive: true });
writeFileSync(
  resolve(root, 'index.html'),
  '<!doctype html><html><body><main></main><script type="module" src="/main.js"></script></body></html>',
);
writeFileSync(
  resolve(root, 'main.js'),
  `
import { createTwillHighlighter } from '/@fs/${resolve('dist/shiki.js').replaceAll('\\', '/')}';
const h = await createTwillHighlighter();
document.querySelector('main').innerHTML = h.codeToHtml('const view = <div>{users.filter { .active }}</div>;', { lang: 'twillx', theme: 'github-dark' });
window.highlightAgain = () => h.codeToHtml('function f() { defer { close(); } }', { lang: 'twill', theme: 'github-light' });
`,
);
const server = await createServer({
  root,
  configFile: false,
  server: { port: 4177, host: '127.0.0.1', strictPort: true },
  logLevel: 'warn',
});
await server.listen();
async function close() {
  await server.close();
  process.exit(0);
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
