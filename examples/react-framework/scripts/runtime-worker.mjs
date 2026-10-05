import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const variant = process.argv[2];
assert(['native', 'twill'].includes(variant));
const react = await import(
  pathToFileURL(resolve(import.meta.dirname, `../dist/${variant}-production/index.js`)).href
);
const children = [
  null,
  0,
  'text',
  [react.createElement('span', { key: 'a' }), react.createElement('span', { key: 'b' })],
];
const samples = [];
let checksum = 0;
function batch() {
  let count = 0;
  for (let i = 0; i < 10000; i++) {
    const element = react.createElement('button', { key: String(i), value: i }, 'ok');
    const clone = react.cloneElement(element, { value: i + 1 });
    count += clone.props.value + react.Children.toArray(children).length;
  }
  return count;
}
for (let i = 0; i < 10; i++) checksum = batch();
for (let i = 0; i < 15; i++) {
  const start = performance.now();
  const result = batch();
  samples.push(performance.now() - start);
  assert.equal(result, checksum);
}
assert.equal(checksum, 50045000);
process.stdout.write(
  JSON.stringify({ samples, checksum, maxRSSKiB: process.resourceUsage().maxRSS }),
);
