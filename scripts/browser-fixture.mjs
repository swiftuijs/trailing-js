import { createServer } from 'vite';
import twillReact from '@swiftuijs/twill/vite-react';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve('.twill/browser-fixture');
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
writeFileSync(
  resolve(root, 'index.html'),
  '<!doctype html><html><head><title>Twill refresh fixture</title></head><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>',
);
writeFileSync(resolve(root, 'label.ts'), 'export const label = "Count";');
writeFileSync(
  resolve(root, 'value.twill'),
  'const invoke=(body:()=>number|void)=>body();export const value=invoke {42};',
);
writeFileSync(
  resolve(root, 'App.twillx'),
  `import {useState} from 'react';
import {label} from './label.ts';
import {value} from './value.twill';
function Panel(props: {children?: import('react').ReactNode}) { return <main>{props.children}</main>; }
export default function App() {
  const [count, setCount] = useState(0);
  return Panel { <output key="value">Value: {String(value)}</output>; <button key="counter" onClick={() => setCount(count + 1)}>{label}: {count}</button>; };
}`,
);
writeFileSync(
  resolve(root, 'main.tsx'),
  `import {createRoot} from 'react-dom/client';import App from './App.twillx';createRoot(document.getElementById('root')!).render(<App/>);`,
);
const server = await createServer({
  configFile: false,
  root,
  plugins: twillReact(),
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
  logLevel: 'warn',
});
await server.listen();
console.log('React refresh fixture listening on http://127.0.0.1:4174');
async function close() {
  await server.close();
  rmSync(root, { recursive: true, force: true });
  process.exit(0);
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
