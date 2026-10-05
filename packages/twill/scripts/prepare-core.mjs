import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../', import.meta.url));
for (const name of ['README.md', 'LICENSE'])
  copyFileSync(root + name, root + 'packages/twill/' + name);
