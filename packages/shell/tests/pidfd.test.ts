import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

it.skipIf(process.platform !== 'linux').each(['enosys', 'eperm', 'eacces', 'emfile'])(
  'preserves real child ownership with pidfd_open returning %s',
  (failure) => {
    const folder = mkdtempSync(join(tmpdir(), 'twill-pidfd-denied-'));
    try {
      const launcher = join(folder, 'deny-pidfd');
      execFileSync('cc', [
        '-O2',
        '-Wall',
        '-Wextra',
        '-Werror',
        fileURLToPath(new URL('./fixtures/deny-pidfd.c', import.meta.url)),
        '-o',
        launcher,
      ]);
      const api = new URL('../dist/index.js', import.meta.url).href;
      const code = `
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {Command,Output,Subprocess,ProcessAbortError,ProcessTimeoutError,ProcessError} from ${JSON.stringify(api)};
const mode=${JSON.stringify(failure)};
if(mode==='emfile'){
  const error=await Subprocess.run(Command.path(process.execPath,['-e','setInterval(()=>{},1000)']),{output:Output.discard(),error:Output.discard()}).catch(e=>e);
  assert(error instanceof ProcessError);assert.equal(error.cause.errno,24);assert.equal(error.unresolvedProcessIdentifier,undefined);assert.throws(()=>process.kill(error.processIdentifier,0));
}else{
  const bytes=Buffer.alloc(1024*1024,255);
  const result=await Subprocess.run(Command.path(process.execPath,['-e','process.stdin.pipe(process.stdout)']),{input:bytes,output:Output.bytes({limit:bytes.length})});
  assert(result.standardOutput.equals(bytes));assert.equal(result.terminationStatus.code,0);assert.throws(()=>process.kill(result.processIdentifier,0));
  const results=await Promise.all(Array.from({length:32},()=>Subprocess.run(Command.path(process.execPath,['-e','']),{output:Output.discard(),error:Output.discard()})));
  for(const child of results){assert.equal(child.terminationStatus.code,0);assert.throws(()=>process.kill(child.processIdentifier,0));}
  const controller=new AbortController();const task=Subprocess.run(Command.path(process.execPath,['-e','setInterval(()=>{},1000)']),{signal:controller.signal,gracePeriodMs:0,output:Output.discard(),error:Output.discard()});
  controller.abort('denied pidfd');const error=await task.catch(e=>e);assert(error instanceof ProcessAbortError);assert.equal(error.unresolvedProcessIdentifier,undefined);assert.throws(()=>process.kill(error.processIdentifier,0));assert.equal(getEventListeners(controller.signal,'abort').length,0);
  const timeout=await Subprocess.run(Command.path(process.execPath,['-e','setInterval(()=>{},1000)']),{timeoutMs:30,gracePeriodMs:0,output:Output.discard(),error:Output.discard()}).catch(e=>e);assert(timeout instanceof ProcessTimeoutError);assert.equal(timeout.unresolvedProcessIdentifier,undefined);assert.throws(()=>process.kill(timeout.processIdentifier,0));
}
console.log('verified owned pidfd behavior');`;
      const result = execFileSync(
        launcher,
        [failure, process.execPath, '--input-type=module', '-e', code],
        { encoding: 'utf8', timeout: 15000 },
      );
      expect(result).toContain('verified owned pidfd behavior');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  },
);
