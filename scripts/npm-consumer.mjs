import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, resolve } from 'node:path';

// Deliberately exercise an independent npm consumer. Repository installation,
// workspaces and all builds use pnpm; npm must also consume the public tarball.
const paths = [dirname(process.execPath), ...(process.env.PATH ?? '').split(delimiter)];
const cli = paths
  .flatMap((path) => [
    resolve(path, 'node_modules/npm/bin/npm-cli.js'),
    resolve(path, '../lib/node_modules/npm/bin/npm-cli.js'),
  ])
  .find(existsSync);
if (!cli) throw new Error('An npm CLI is required for the independent npm consumer check.');
export const npmConsumer = (args, options = {}) =>
  execFileSync(process.execPath, [cli, ...args], options);
