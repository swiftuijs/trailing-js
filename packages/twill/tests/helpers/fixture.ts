import { mkdirSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Framework/build fixtures need this package's dependencies. Keep transient
// projects in its ignored directory, rather than exposing them to format/lint.
export function fixtureRoot(prefix: string) {
  const directory = fileURLToPath(new URL('../../.twill/tests/', import.meta.url));
  mkdirSync(directory, { recursive: true });
  return mkdtempSync(join(directory, prefix));
}
