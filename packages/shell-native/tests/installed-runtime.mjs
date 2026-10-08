// Executed from an independent npm installation, also on Node 20.19.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getEventListeners, setMaxListeners } from 'node:events';
import { Worker } from 'node:worker_threads';
import { execFileSync } from 'node:child_process';
import { Command, Output, Subprocess, ProcessAbortError } from '@swiftuijs/twill-shell-native';
const apiURL = import.meta.resolve('@swiftuijs/twill-shell-native');
const childCode =
  'const fs=require("node:fs"),tmp=process.argv[1]+"."+process.pid+".tmp";fs.writeFileSync(tmp,String(process.pid));fs.renameSync(tmp,process.argv[1]);process.on("SIGTERM",()=>{});setInterval(()=>{},1000)';
const roots = [],
  pids = [],
  workers = [];
const folder = () => {
  const path = mkdtempSync(join(tmpdir(), 'twill-native-installed-'));
  roots.push(path);
  return path;
};
async function ready(markers) {
  const end = Date.now() + 10000;
  while (!markers.every(existsSync)) {
    assert(Date.now() < end, 'Children did not become ready');
    await new Promise((r) => setTimeout(r, 5));
  }
  const owned = markers.map((marker) => Number(readFileSync(marker, 'utf8')));
  pids.push(...owned);
  return owned;
}
const gone = (pid) => assert.throws(() => process.kill(pid, 0));
const message = (worker) =>
  new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });
test('installed native lifetime and scheduling contracts', { timeout: 60000 }, async (t) => {
  try {
    await t.test('repeated fresh exits and worker environment disposal remain safe', async () => {
      const code = `import {Command,Output,Subprocess} from ${JSON.stringify(apiURL)};
        const results=await Promise.all(Array.from({length:4},()=>Subprocess.run(Command.path(process.execPath,['-e','']),{output:Output.discard()})));
        if(results.some(r=>r.terminationStatus.code!==0))throw Error('Incorrect result');
        process.stdout.write('complete');`;
      for (let i = 0; i < 48; i++) {
        assert.equal(
          execFileSync(process.execPath, ['--input-type=module', '-e', code], {
            timeout: 15000,
            encoding: 'utf8',
          }),
          'complete',
        );
      }
      // Natural worker exit runs environment cleanup after completed promises;
      // forced worker termination exercises the same hook with active children.
      for (let i = 0; i < 12; i++) {
        const worker = new Worker(
          `const {parentPort,workerData}=require('node:worker_threads');
          (async()=>{const {Command,Output,Subprocess}=await import(workerData);
          await Promise.all(Array.from({length:4},()=>Subprocess.run(Command.path(process.execPath,['-e','']),{output:Output.discard()})));
          parentPort.postMessage('complete')})();`,
          { eval: true, workerData: apiURL },
        );
        workers.push(worker);
        const exited = new Promise((resolve, reject) => {
          worker.once('exit', resolve);
          worker.once('error', reject);
        });
        assert.equal(await message(worker), 'complete');
        assert.equal(await exited, 0);
      }
    });
    await t.test('one libuv worker remains free while 32 native children run', async () => {
      const root = folder(),
        controller = new AbortController();
      setMaxListeners(0, controller.signal);
      const markers = Array.from({ length: 32 }, (_, i) => join(root, String(i)));
      const tasks = markers.map((marker) =>
        Subprocess.run(Command.path(process.execPath, ['-e', childCode, marker]), {
          signal: controller.signal,
          output: Output.discard(),
          gracePeriodMs: 0,
          killTimeoutMs: 1000,
        }),
      );
      tasks.forEach((task) => task.catch(() => {}));
      const owned = await ready(markers);
      assert((await readFile(import.meta.filename)).length > 0);
      controller.abort('cancel');
      for (const task of tasks) await assert.rejects(task, ProcessAbortError);
      owned.forEach(gone);
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    });
    await t.test(
      'large binary input is copied and both outputs drain without deadlock',
      async () => {
        const input = Buffer.alloc(4 * 1024 * 1024, 255);
        const task = Subprocess.run(
          Command.path(process.execPath, [
            '-e',
            'process.stdin.on("data",b=>{process.stdout.write(b);process.stderr.write(b)})',
          ]),
          {
            input,
            output: Output.bytes({ limit: input.length }),
            error: Output.bytes({ limit: input.length }),
            timeoutMs: 15000,
          },
        );
        input.fill(0);
        const result = await task,
          expected = Buffer.alloc(input.length, 255);
        assert(result.standardOutput.equals(expected));
        assert(result.standardError.equals(expected));
        gone(result.processIdentifier);
      },
    );
    await t.test(
      'worker teardown owns its direct children and releases descendant-held pipes',
      async () => {
        const root = folder(),
          direct = join(root, 'direct'),
          descendant = join(root, 'descendant');
        const worker = new Worker(
          `
        const {parentPort,workerData}=require('node:worker_threads');const fs=require('node:fs');
        (async()=>{const {Command,Output,Subprocess}=await import(workerData.apiURL);
        Subprocess.run(Command.path(process.execPath,['-e',workerData.childCode,workerData.direct]),{output:Output.discard()}).catch(()=>{});
        const descendantCode='const fs=require("node:fs"),tmp=process.argv[1]+"."+process.pid+".tmp";fs.writeFileSync(tmp,String(process.pid));fs.renameSync(tmp,process.argv[1]);setInterval(()=>{},1000)';
        const parentCode='require("node:child_process").spawn(process.execPath,["-e",'+JSON.stringify(descendantCode)+','+JSON.stringify(workerData.descendant)+'],{detached:true,stdio:["ignore",1,2]}).unref();const fs=require("node:fs");const timer=setInterval(()=>{if(fs.existsSync('+JSON.stringify(workerData.descendant)+'))clearInterval(timer)},5)';
        Subprocess.run(Command.path(process.execPath,['-e',parentCode]),{output:Output.text({limit:4096}),error:Output.text({limit:4096})}).catch(()=>{});
        while(![workerData.direct,workerData.descendant].every(fs.existsSync))await new Promise(r=>setTimeout(r,5));
        parentPort.postMessage('ready');})();
      `,
          { eval: true, workerData: { apiURL, childCode, direct, descendant } },
        );
        workers.push(worker);
        await message(worker);
        const [owned, unowned] = await ready([direct, descendant]);
        await worker.terminate();
        gone(owned);
        assert.doesNotThrow(() => process.kill(unowned, 0));
        assert.equal(
          (
            await Subprocess.run(Command.path(process.execPath, ['-e', '']), {
              output: Output.discard(),
            })
          ).terminationStatus.code,
          0,
        );
      },
    );
    await t.test('explicit parent exit joins native direct-child cleanup', async () => {
      const marker = join(folder(), 'pid');
      const code = `import fs from 'node:fs';import {Command,Output,Subprocess} from ${JSON.stringify(apiURL)};
      Subprocess.run(Command.path(process.execPath,['-e',${JSON.stringify(childCode)},${JSON.stringify(marker)}]),{output:Output.discard()}).catch(()=>{});
      while(!fs.existsSync(${JSON.stringify(marker)}))await new Promise(r=>setTimeout(r,5));process.exit(23);`;
      assert.throws(
        () =>
          execFileSync(process.execPath, ['--input-type=module', '-e', code], { timeout: 15000 }),
        { status: 23 },
      );
      const [pid] = await ready([marker]);
      gone(pid);
    });
  } finally {
    for (const worker of workers) await worker.terminate();
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
    }
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  }
});
