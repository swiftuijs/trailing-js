import { readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// Both are prerequisites of the compiler build. See AGENTS.md for the boundary.
const bootstrap = new Set(['packages/twill', 'packages/runtime']);
const violations = [];
let sources = 0;
function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) visit(path);
    else if (/\.twillx?$/.test(entry.name)) sources++;
    else if (
      /\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/.test(entry.name) &&
      !/\.d\.[cm]?ts$/.test(entry.name)
    ) {
      violations.push(relative(root, path));
    }
  }
}
for (const area of ['packages', 'editors']) {
  for (const entry of readdirSync(join(root, area), { withFileTypes: true })) {
    const workspace = `${area}/${entry.name}`;
    if (!entry.isDirectory() || bootstrap.has(workspace)) continue;
    const source = join(root, workspace, 'src');
    // Workspaces without implementation sources need no language migration.
    if (readdirSync(join(root, workspace)).includes('src')) visit(source);
  }
}
if (violations.length) {
  throw new Error(
    `Use Twill for package/editor implementation sources (see AGENTS.md):\n${violations.sort().join('\n')}`,
  );
}
if (!sources) throw new Error('No Twill package/editor implementation sources found.');
console.log(`Twill implementation policy verified: ${sources} source files.`);
