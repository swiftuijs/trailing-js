import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

// Match the SDK's original tsc maps: keep positions/paths without repeating
// implementation text in both JS and declaration maps (16 KiB archive budget).
const output = new URL('../dist/', import.meta.url);
for (const name of readdirSync(output)) {
  if (!name.endsWith('.map')) continue;
  const path = new URL(name, output);
  const map = JSON.parse(readFileSync(path, 'utf8'));
  delete map.sourcesContent;
  writeFileSync(path, JSON.stringify(map));
}
