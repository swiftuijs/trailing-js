import { build } from 'esbuild';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const result = await build({
  entryPoints: ['src/typescript-plugin.ts'],
  outfile: 'dist/typescript-plugin.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['typescript'],
  metafile: true,
  sourcemap: true,
  footer: { js: 'module.exports = module.exports.default;' },
});
const packages = new Set(
  Object.keys(result.metafile.inputs)
    .map((path) => path.match(/node_modules\/(\@[^/]+\/[^/]+|[^/]+)/)?.[1])
    .filter(Boolean),
);
let notices = '';
for (const name of [...packages].sort()) {
  const root = join('node_modules', name);
  notices += `\n${name}\n${'='.repeat(name.length)}\n`;
  for (const file of readdirSync(root).filter((file) =>
    /^(?:licen[cs]e|notice|copyright)(?:\.|$)/i.test(file),
  ))
    notices += readFileSync(join(root, file), 'utf8') + '\n';
}
writeFileSync('dist/typescript-plugin.LICENSE.txt', notices);
