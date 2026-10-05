import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const cleanup = JSON.parse(
  execFileSync(process.execPath, ['--import', '@swiftuijs/twill/register', 'run.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }),
);
assert.equal(cleanup.content, 'Hello from Twill');
assert.deepEqual(cleanup.events, ['file closed', 'body complete', 'directory removed']);
