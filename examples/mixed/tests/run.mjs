import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const mixed = JSON.parse(
  execFileSync(process.execPath, ['--import', '@swiftuijs/twill/register', 'main.js'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }),
);
assert.deepEqual(mixed, { summaries: ['Ada: 12', 'Lin: 9'], status: 'status: active' });
