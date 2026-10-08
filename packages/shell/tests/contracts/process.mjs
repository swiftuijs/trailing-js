import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEventListeners } from 'node:events';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
  realpathSync,
  copyFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// Shared observable contracts exercised with real processes, not a replacement
// implementation. Each backend supplies its own public API/error constructors.
export function defineProcessContracts(api, moduleURL) {
  const { Command, Environment, Input, Output, Subprocess } = api;
  const fixture = fileURLToPath(new URL('../fixtures/child.mjs', import.meta.url));
  describe('shared subprocess contract', () => {
    const roots = [],
      children = [];
    afterEach(() => {
      for (const pid of children.splice(0)) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {}
      }
      for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
    });
    const root = () => {
      const path = mkdtempSync(join(tmpdir(), 'twill-process-contract-'));
      roots.push(path);
      return path;
    };
    const command = (mode, ...args) => Command.path(process.execPath, [fixture, mode, ...args]);
    const text = (limit = 4 * 1024 * 1024) => Output.text({ limit });
    const bytes = (limit = 4 * 1024 * 1024) => Output.bytes({ limit });
    const gone = (pid) => expect(() => process.kill(pid, 0)).toThrow();
    async function ready(marker) {
      await vi.waitFor(() => expect(existsSync(marker)).toBe(true), {
        timeout: 5000,
        interval: 10,
      });
      const pid = Number(readFileSync(marker, 'utf8'));
      children.push(pid);
      return pid;
    }
    it('preserves literal argv and reusable commands across concurrent launches', async () => {
      const args = ['', 'space and "quotes"', '$(touch nope); | & * ?', 'line\nbreak', '中文🪶'];
      const input = [fixture, 'argv', ...args],
        cmd = Command.path(process.execPath, input);
      input.splice(0, input.length, 'invalid');
      const results = await Promise.all(
        Array.from({ length: 8 }, () => Subprocess.run(cmd, { output: text() })),
      );
      expect(new Set(results.map((result) => result.processIdentifier)).size).toBe(8);
      for (const result of results) {
        expect(JSON.parse(result.standardOutput)).toEqual(args);
        gone(result.processIdentifier);
      }
    });
    it('searches a name with the selected child PATH', async () => {
      const result = await Subprocess.run(
        Command.name(basename(process.execPath), [fixture, 'argv', 'found']),
        {
          environment: Environment.replace({ PATH: dirname(process.execPath) }),
          output: text(),
        },
      );
      expect(result.standardOutput).toBe('["found"]');
    });
    it.runIf(process.platform === 'win32')(
      'preserves Windows executable suffix order and child-relative quoted PATH without system-directory fallback',
      async () => {
        const cwd = root(),
          folder = join(cwd, 'quoted;path');
        mkdirSync(folder);
        const binary = join(folder, 'twill-contract-tool.com');
        copyFileSync(process.execPath, binary);
        const environment = Environment.replace({ PATH: '"quoted;path"', PATHEXT: '.CMD;.BAT' });
        const result = await Subprocess.run(
          Command.name('twill-contract-tool', [fixture, 'argv', 'literal']),
          { cwd, environment, output: text() },
        );
        expect(result.standardOutput).toBe('["literal"]');
        await expect(
          Subprocess.run(Command.name('cmd.exe'), { cwd, environment, check: false }),
        ).rejects.toBeInstanceOf(api.ProcessLaunchError);
        const direct = await Subprocess.run(
          Command.path(join(folder, 'twill-contract-tool'), [fixture, 'argv', 'direct']),
          { cwd, environment, output: text() },
        );
        expect(direct.standardOutput).toBe('["direct"]');
      },
    );
    it('isolates simultaneous cwd/environment updates and snapshots replacement values', async () => {
      const originalCwd = process.cwd(),
        original = process.env.TWILL_CONTRACT;
      const folders = [root(), root()];
      const values = { TWILL_CONTRACT: 'snapshot' },
        policy = Environment.replace(values);
      values.TWILL_CONTRACT = 'changed';
      const results = await Promise.all(
        folders.map((cwd) =>
          Subprocess.run(command('env'), { cwd, environment: policy, output: text() }),
        ),
      );
      for (const [i, result] of results.entries()) {
        const value = JSON.parse(result.standardOutput);
        expect(realpathSync(value.cwd)).toBe(realpathSync(folders[i]));
        expect(value.env.TWILL_CONTRACT).toBe('snapshot');
        if (process.platform === 'win32') expect(value.env.PATH).toBe(process.env.PATH);
        else expect(value.env.PATH).toBeUndefined();
        expect(value.env.PNPM_HOME).toBeUndefined();
      }
      expect(process.cwd()).toBe(originalCwd);
      expect(process.env.TWILL_CONTRACT).toBe(original);
    });
    it('inherits current environment, applies removals and preserves empty strings', async () => {
      const key = `TWILL_CONTRACT_${process.pid}`,
        before = process.env[key];
      try {
        process.env[key] = 'parent';
        const inherited = await Subprocess.run(command('env'), { output: text() });
        expect(JSON.parse(inherited.standardOutput).env[key]).toBe('parent');
        const removed = await Subprocess.run(command('env'), {
          environment: Environment.inherit({ [key]: undefined, TWILL_EMPTY: '' }),
          output: text(),
        });
        expect(JSON.parse(removed.standardOutput).env[key]).toBeUndefined();
        expect(JSON.parse(removed.standardOutput).env.TWILL_EMPTY).toBe('');
        expect(process.env[key]).toBe('parent');
      } finally {
        if (before === undefined) delete process.env[key];
        else process.env[key] = before;
      }
    });
    it('provides EOF with no input and preserves sliced binary input', async () => {
      expect((await Subprocess.run(command('none'), { output: text() })).standardOutput).toBe('0');
      expect(
        (await Subprocess.run(command('none'), { input: Input.none(), output: text() }))
          .standardOutput,
      ).toBe('0');
      const input = Uint8Array.from([17, 255, 0, 128, 19]).subarray(1, 4);
      expect(
        (await Subprocess.run(command('echo'), { input, output: bytes() })).standardOutput,
      ).toEqual(Buffer.from([255, 0, 128]));
      expect(
        (await Subprocess.run(command('echo'), { input: '🪶\0text', output: text() }))
          .standardOutput,
      ).toBe('🪶\0text');
    });
    it('inherits the parent stdin descriptor in a fresh interpreter', () => {
      const code = `import {Command,Input,Output,Subprocess} from ${JSON.stringify(moduleURL)}; const r=await Subprocess.run(Command.path(process.execPath,[${JSON.stringify(fixture)},'echo']),{input:Input.inherit(),output:Output.bytes({limit:1024})});process.stdout.write(r.standardOutput);`;
      const input = Buffer.from([0, 255, 128, 10]);
      expect(
        execFileSync(process.execPath, ['--input-type=module', '-e', code], {
          input,
          timeout: 10000,
        }),
      ).toEqual(input);
    });
    it('inherits stdout and stderr with their real data intact', () => {
      const code = `import {Command,Subprocess} from ${JSON.stringify(moduleURL)}; await Subprocess.run(Command.path(process.execPath,['-e','process.stdout.write("out");process.stderr.write("err")']));`;
      const result = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
        timeout: 10000,
      });
      expect(result.toString()).toBe('out');
      const marker = join(root(), 'stderr');
      const capture = `import fs from 'node:fs';import {spawnSync} from 'node:child_process';const r=spawnSync(process.execPath,['--input-type=module','-e',${JSON.stringify(code)}]);fs.writeFileSync(${JSON.stringify(marker)},r.stderr);if(r.status!==0)process.exit(1);`;
      execFileSync(process.execPath, ['--input-type=module', '-e', capture], { timeout: 10000 });
      expect(readFileSync(marker, 'utf8')).toBe('err');
    });
    it.runIf(process.platform === 'win32')(
      'never implicitly runs Windows batch scripts through a command shell',
      async () => {
        const folder = root(),
          script = join(folder, 'unsafe.cmd'),
          marker = join(folder, 'never');
        writeFileSync(script, `@echo unsafe>${marker}\r\n`);
        await expect(Subprocess.run(Command.path(script), { check: false })).rejects.toBeInstanceOf(
          api.ProcessLaunchError,
        );
        expect(existsSync(marker)).toBe(false);
      },
    );
    it('returns undefined for inherited/discarded output and freezes successful metadata', async () => {
      const result = await Subprocess.run(command('argv'), {
        output: Output.discard(),
        error: Output.discard(),
      });
      expect(result.standardOutput).toBeUndefined();
      expect(result.standardError).toBeUndefined();
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.terminationStatus)).toBe(true);
      expect(
        (await Subprocess.run(Command.path(process.execPath, ['-e', '']))).standardOutput,
      ).toBeUndefined();
    });
    it('decodes split UTF-8 once and replaces invalid UTF-8 while preserving bytes', async () => {
      expect(
        (await Subprocess.run(command('unicode-split'), { output: text(4) })).standardOutput,
      ).toBe('🪶');
      expect((await Subprocess.run(command('binary'), { output: text(2) })).standardOutput).toBe(
        '�a',
      );
      expect(
        (await Subprocess.run(command('binary'), { output: bytes(2) })).standardOutput,
      ).toEqual(Buffer.from([255, 97]));
    });
    it.each(['stdout', 'stderr'])(
      'rejects %s byte overflow even with exit checking disabled',
      async (stream) => {
        const options = {
          output: bytes(stream === 'stdout' ? 3 : 4),
          error: bytes(stream === 'stderr' ? 3 : 4),
          check: false,
          gracePeriodMs: 0,
        };
        await expect(Subprocess.run(command('large', '4'), options)).rejects.toBeInstanceOf(
          api.OutputLimitError,
        );
      },
    );
    it('drains two large streams while writing large input under backpressure', async () => {
      const size = 4 * 1024 * 1024,
        input = Buffer.alloc(size, 255);
      const code = 'process.stdin.on("data",b=>{process.stdout.write(b);process.stderr.write(b)});';
      const result = await Subprocess.run(Command.path(process.execPath, ['-e', code]), {
        input,
        output: bytes(size),
        error: bytes(size),
        timeoutMs: 10000,
      });
      expect(result.standardOutput.equals(input)).toBe(true);
      expect(result.standardError.equals(input)).toBe(true);
      gone(result.processIdentifier);
    });
    it('retains checked exit metadata and returns unchecked nonzero statuses', async () => {
      const options = { output: text(), error: text() };
      const error = await Subprocess.run(command('exit', '23'), options).catch((value) => value);
      expect(error).toBeInstanceOf(api.ProcessExitError);
      expect(error).toMatchObject({
        terminationStatus: { kind: 'exited', code: 23 },
        standardOutput: 'out',
        standardError: 'err',
      });
      gone(error.processIdentifier);
      const result = await Subprocess.run(command('exit', '23'), { ...options, check: false });
      expect(result.terminationStatus).toEqual({ kind: 'exited', code: 23 });
    });
    it('preserves native signal statuses', async () => {
      const result = await Subprocess.run(command('signal'), { check: false });
      if (process.platform === 'win32') expect(result.terminationStatus.kind).toBe('exited');
      else expect(result.terminationStatus).toEqual({ kind: 'signaled', signal: 'SIGTERM' });
    });
    it('rejects failed executable and cwd launches independently of check', async () => {
      const missing = join(root(), 'missing');
      for (const [cmd, options] of [
        [Command.path(missing), {}],
        [command('argv'), { cwd: missing }],
      ]) {
        const failure = await Subprocess.run(cmd, {
          ...options,
          check: false,
          output: text(),
        }).catch((value) => value);
        expect(failure).toBeInstanceOf(api.ProcessLaunchError);
        expect(failure.cause.code).toBe('ENOENT');
      }
    });
    it('rejects early stdin closure and joins the child', async () => {
      const failure = await Subprocess.run(command('early-input'), {
        input: Buffer.alloc(16 * 1024 * 1024),
        check: false,
        gracePeriodMs: 0,
      }).catch((value) => value);
      expect(failure).toBeInstanceOf(api.ProcessIOError);
      expect(failure.stream).toBe('stdin');
      gone(failure.processIdentifier);
    });
    it('validates options and detached input before creating a child', async () => {
      const marker = join(root(), 'never');
      const data = new Uint8Array(4);
      structuredClone(data.buffer, { transfer: [data.buffer] });
      for (const options of [
        { shell: true },
        { timeoutMs: 0 },
        { killTimeoutMs: 0 },
        { check: 1 },
        { input: data },
        { output: { kind: 'text', limit: 1024 } },
      ]) {
        await expect(Subprocess.run(command('wait', marker), options)).rejects.toBeInstanceOf(
          TypeError,
        );
      }
      expect(existsSync(marker)).toBe(false);
    });
    it('launches nothing for an already aborted signal', async () => {
      const controller = new AbortController(),
        marker = join(root(), 'never'),
        reason = { cancel: true };
      controller.abort(reason);
      await expect(
        Subprocess.run(command('wait', marker), { signal: controller.signal }),
      ).rejects.toMatchObject({
        name: 'ProcessAbortError',
        cause: reason,
        processIdentifier: undefined,
      });
      expect(existsSync(marker)).toBe(false);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    });
    it.each(['wait', 'graceful', 'ignore-term'])(
      'cancels %s, preserves the reason and waits for direct-child teardown',
      async (mode) => {
        const controller = new AbortController(),
          marker = join(root(), 'pid'),
          reason = { cancel: mode };
        controller.signal.addEventListener('abort', (event) => event.stopImmediatePropagation(), {
          once: true,
        });
        const pending = Subprocess.run(command(mode, marker), {
          signal: controller.signal,
          output: text(),
          gracePeriodMs: 30,
          killTimeoutMs: 1000,
          check: false,
        });
        pending.catch(() => {});
        const pid = await ready(marker);
        controller.abort(reason);
        await expect(pending).rejects.toMatchObject({
          name: 'ProcessAbortError',
          cause: reason,
          processIdentifier: pid,
          unresolvedProcessIdentifier: undefined,
        });
        gone(pid);
        expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      },
    );
    it('times out, forcibly reaps an uncooperative child and disposes the signal listener', async () => {
      const controller = new AbortController(),
        marker = join(root(), 'pid');
      const pending = Subprocess.run(command('ignore-term', marker), {
        signal: controller.signal,
        output: text(),
        timeoutMs: 1500,
        gracePeriodMs: 20,
        killTimeoutMs: 1000,
      });
      pending.catch(() => {});
      const pid = await ready(marker);
      await expect(pending).rejects.toMatchObject({
        name: 'ProcessTimeoutError',
        timeoutMs: 1500,
        processIdentifier: pid,
      });
      gone(pid);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    });
    it('cleans completed listeners/timers and ignores abort after success', async () => {
      const controller = new AbortController();
      const result = await Subprocess.run(command('argv'), {
        signal: controller.signal,
        timeoutMs: 5000,
        output: text(),
      });
      controller.abort();
      expect(result.standardOutput).toBe('[]');
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    });
    it('bounds failed I/O even when an unowned descendant retains pipe descriptors', async () => {
      const controller = new AbortController(),
        marker = join(root(), 'descendant');
      const pending = Subprocess.run(command('descendant', marker), {
        signal: controller.signal,
        output: text(),
        error: text(),
        gracePeriodMs: 0,
        killTimeoutMs: 1000,
      });
      pending.catch(() => {});
      const descendant = await ready(marker);
      // Allow the directly owned parent to exit, leaving the descendant's pipes.
      await new Promise((resolve) => setTimeout(resolve, 100));
      controller.abort();
      await expect(pending).rejects.toBeInstanceOf(api.ProcessAbortError);
      expect(() => process.kill(descendant, 0)).not.toThrow();
    });
    it('settles immediate cancellation races once and remains reusable', async () => {
      const controller = new AbortController(),
        marker = join(root(), 'race');
      const pending = Subprocess.run(command('wait', marker), {
        signal: controller.signal,
        gracePeriodMs: 0,
      });
      pending.catch(() => {});
      controller.abort('race');
      const failure = await pending.catch((value) => value);
      expect(failure).toBeInstanceOf(api.ProcessAbortError);
      if (failure.processIdentifier !== undefined) gone(failure.processIdentifier);
      const result = await Subprocess.run(command('argv'), { output: text() });
      expect(result.standardOutput).toBe('[]');
    });
  });
}
