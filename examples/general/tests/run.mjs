import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const general = JSON.parse(
  execFileSync(process.execPath, ['--import', '@swiftuijs/twill/register', 'run.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }),
);
assert.deepEqual(general.result, ['1. B: 30', '2. A: 12']);
assert.deepEqual(general.query, ['SELECT', 'id', 'name', 'FROM users', 'WHERE active = true']);
