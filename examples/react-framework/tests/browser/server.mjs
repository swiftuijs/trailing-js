import { build, preview } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const app = resolve(root, '.twill/renderer');
mkdirSync(app, { recursive: true });
writeFileSync(
  resolve(app, 'index.html'),
  '<!doctype html><html><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>',
);
const source = `
import React, { Suspense, useState, useEffect, useReducer, useMemo, useRef, startTransition, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
const Context = createContext('default');
let ready = false;
let resolvePending;
const pending = new Promise(resolve => { resolvePending = resolve; });
function Delayed() { if (!ready) throw pending; return <span>Resolved resource</span>; }
function Child() {
  useEffect(() => { window.events.push('mount'); return () => { window.events.push('cleanup'); }; }, []);
  return <span>Owned child</span>;
}
function Panel() {
  const [count, setCount] = useState(0);
  const [visible, toggle] = useReducer(value => !value, true);
  const [waiting, setWaiting] = useState(false);
  const context = useContext(Context);
  const ref = useRef(null);
  const doubled = useMemo(() => count * 2, [count]);
  return <main><h1>React source compatibility</h1><output ref={ref}>Count: {count}; doubled: {doubled}; context: {context}</output>
    <button onClick={() => setCount(value => value + 1)}>Increment</button>
    <button onClick={() => startTransition(() => setCount(value => value + 10))}>Transition</button>
    <button onClick={toggle}>Toggle child</button>{visible ? <Child/> : null}
    <button onClick={() => setWaiting(true)}>Suspend</button>
    <button onClick={() => { ready = true; resolvePending(); }}>Resolve</button>
    <Suspense fallback={<span>Loading resource</span>}>{waiting ? <Delayed/> : null}</Suspense>
  </main>;
}
window.events = [];
createRoot(document.getElementById('root')).render(<Context.Provider value="provided"><Panel/></Context.Provider>);
`;
writeFileSync(resolve(app, 'main.tsx'), source);
const servers = [];
for (const [variant, port] of [
  ['native', 4178],
  ['twill', 4179],
]) {
  const bridge = resolve(app, variant + '.js');
  const framework = resolve(root, `dist/${variant}-production/index.js`).replaceAll('\\', '/');
  writeFileSync(
    bridge,
    `import * as React from ${JSON.stringify(framework)}; export * from ${JSON.stringify(framework)}; export default React;`,
  );
  const config = {
    root: app,
    configFile: false,
    logLevel: 'warn',
    resolve: { alias: [{ find: /^react$/, replacement: bridge }] },
    build: { outDir: resolve(root, `dist/browser-${variant}`), emptyOutDir: true },
  };
  await build(config);
  const server = await preview({
    ...config,
    preview: { port, host: '127.0.0.1', strictPort: true },
  });
  servers.push(server);
}
async function close() {
  await Promise.all(
    servers.map((server) => new Promise((resolve) => server.httpServer.close(resolve))),
  );
  process.exit(0);
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
