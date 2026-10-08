import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { register } from 'node:module';
import { realpathSync } from 'node:fs';

export async function run(filename, args) {
  const script = resolve(filename);
  const url = pathToFileURL(script).href;
  const native = /^(?:\.[cm]?js|\.[cm]?ts|\.jsx|\.tsx)$/.test(extname(script));
  const entries = native ? [] : [url, pathToFileURL(realpathSync(script)).href];
  process.argv = [process.execPath, script, ...args];
  process.setSourceMapsEnabled(true);
  register('../dist/loader.js', import.meta.url, { data: { entries } });
  await import(url);
}
