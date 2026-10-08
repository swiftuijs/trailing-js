import { afterEach, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/twill.mjs', import.meta.url));
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture(source: string, name = 'script.twill') {
  const root = mkdtempSync(join(tmpdir(), 'twill-runner-'));
  roots.push(root);
  const project = join(root, 'project with spaces');
  const cwd = join(root, 'elsewhere');
  mkdirSync(project);
  mkdirSync(cwd);
  const file = join(project, name);
  writeFileSync(file, source);
  return { root, project, cwd, file };
}
function execute(cwd: string, args: string[], input?: string) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    input,
    env: { ...process.env, TWILL_RUNNER_TEST: 'child local' },
    timeout: 15000,
  });
}
const report = `#!/usr/bin/env twill
import {readFileSync} from 'node:fs';
guard const value = process.env.TWILL_RUNNER_TEST else { throw new Error('missing env'); }
console.error('stderr remains stderr');
console.log(JSON.stringify({argv:process.argv,cwd:process.cwd(),env:value,pid:process.pid,input:readFileSync(0,'utf8')}));`;
it.each(['direct', 'run', 'separator'])(
  '%s runs in the same process with literal argv and native I/O',
  (mode) => {
    const { cwd, file } = fixture(report, 'build # 中文.twill');
    const args = [
      '--help',
      '-p',
      '--runtime',
      '--',
      '',
      'a b',
      '"quote"',
      '中文;$(echo unsafe)',
      'line\nbreak',
    ];
    const prefix = mode === 'run' ? ['run'] : mode === 'separator' ? ['--'] : [];
    const result = execute(cwd, [...prefix, file, ...args], 'stdin bytes\n');
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('stderr remains stderr\n');
    expect(JSON.parse(result.stdout)).toEqual({
      argv: [process.execPath, file, ...args],
      cwd: realpathSync(cwd),
      env: 'child local',
      pid: result.pid,
      input: 'stdin bytes\n',
    });
  },
);
it.each(['deploy', 'deploy.task'])(
  'supports a Twill entry named %s without changing native imports',
  (name) => {
    const { project, cwd, file } = fixture(
      `#!/usr/bin/env twill
import {native} from './helper.ts';
const values: number[] = [1,2].map { n in n * 3 };
console.log(JSON.stringify({values,native}));`,
      name,
    );
    writeFileSync(
      join(project, 'helper.ts'),
      'export const native: number[] = [1,2].map(n => n*2);',
    );
    const result = execute(cwd, [file]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ values: [3, 6], native: [2, 4] });
  },
);
it('resolves package imports and the nearest source configuration independently of cwd', () => {
  const { project, cwd, file } = fixture(`import {value} from '@runner/local';
console.log(JSON.stringify({value,implicit:[1].map { 7; }}));`);
  for (const [directory, value] of [
    [project, 'script package'],
    [cwd, 'cwd package'],
  ]) {
    const pkg = join(directory!, 'node_modules', '@runner', 'local');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(
      join(pkg, 'package.json'),
      JSON.stringify({ type: 'module', exports: './index.js' }),
    );
    writeFileSync(join(pkg, 'index.js'), `export const value=${JSON.stringify(value)};`);
  }
  writeFileSync(join(project, 'twill.config.json'), '{"implicitReturn":false}');
  writeFileSync(join(cwd, 'twill.config.json'), '{"implicitReturn":true}');
  const result = execute(cwd, [file]);
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({ value: 'script package', implicit: [null] });
});
it.each(['native.mjs', 'native.cjs', 'native.ts'])(
  'preserves the existing native treatment of %s',
  (name) => {
    const { cwd, file } = fixture('console.log(JSON.stringify([1,2].map(n=>n*2)));', name);
    const result = execute(cwd, [file]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([2, 4]);
  },
);
it.each(['process.exitCode=23;', 'process.exit(23);'])(
  'preserves script exit status: %s',
  (source) => {
    const { cwd, file } = fixture(source);
    expect(execute(cwd, [file]).status).toBe(23);
  },
);
it.each([
  'throw new Error("script failure");',
  'await Promise.reject(new Error("script failure"));',
])('reports original-source exceptions: %s', (failure) => {
  const { cwd, file } = fixture(
    `#!/usr/bin/env twill\nconst values=[1].map { .toFixed(); };\n${failure}\n`,
  );
  const result = execute(cwd, [file]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('script failure');
  expect(result.stderr).toContain(realpathSync(file).replaceAll('\\', '/') + ':3:');
});
it('does not type-check source or reinterpret script flags', () => {
  const { cwd, file } = fixture('const value: number = "native execution";console.log(value);');
  const result = execute(cwd, ['run', file, '--js', '--json', '--project', 'missing']);
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.trim()).toBe('native execution');
});
it.each([['run'], ['run', '--'], ['--']])('reports a missing entry for %j', (...args) => {
  const { cwd } = fixture('');
  const result = execute(cwd, args);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Usage: twill');
});
it.each([
  ['run', '--help'],
  ['run', '-h'],
])('supports runner help %j', (...args) => {
  const { cwd } = fixture('');
  const result = execute(cwd, args);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Usage: twill');
});
it('supports explicit separators and reserved filenames while retaining compiler commands', () => {
  const { project, cwd } = fixture('');
  for (const name of ['--help', '--', 'check']) {
    writeFileSync(join(project, name), 'console.log("script");');
    const result = execute(project, ['run', '--', name, '--help']);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('script');
    const separated = execute(project, ['--', name, '--help']);
    expect(separated.status, separated.stderr).toBe(0);
    expect(separated.stdout.trim()).toBe('script');
  }
  const help = execute(cwd, ['--help']);
  expect(help.status).toBe(0);
  expect(help.stdout).toContain('twill compile');
  expect(help.stdout).toContain('twill run');
});
it.each(['missing.twill', 'invalid.twill'])('fails without successful output for %s', (name) => {
  const { cwd, project } = fixture('');
  if (name === 'invalid.twill') writeFileSync(join(project, name), 'values.map { .');
  const result = execute(cwd, [join(project, name)]);
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
});
it.skipIf(process.platform === 'win32')(
  'executes a real POSIX shebang from a different working directory',
  () => {
    const { root, cwd, file } = fixture(report, 'deploy');
    const bin = join(root, 'bin');
    mkdirSync(bin);
    symlinkSync(cli, join(bin, 'twill'));
    chmodSync(file, 0o755);
    const result = spawnSync(file, ['--help', 'a b'], {
      cwd,
      encoding: 'utf8',
      input: 'native stdin',
      timeout: 15000,
      env: {
        ...process.env,
        TWILL_RUNNER_TEST: 'shebang',
        PATH: bin + delimiter + dirname(process.execPath) + delimiter + process.env.PATH,
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      argv: [process.execPath, file, '--help', 'a b'],
      cwd: realpathSync(cwd),
      env: 'shebang',
      pid: result.pid,
      input: 'native stdin',
    });
  },
);
it.skipIf(process.platform === 'win32')(
  'runs extensionless symlink entries with normal Node resolution',
  () => {
    const { root, cwd, file } = fixture(
      'const value: number = [1].map { .toFixed(); }.length;console.log(value);',
      'deploy',
    );
    const link = join(root, 'linked-deploy');
    symlinkSync(file, link);
    {
      const result = spawnSync(process.execPath, [cli, link], {
        cwd,
        encoding: 'utf8',
        timeout: 15000,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe('1');
    }
  },
);
it.skipIf(process.platform === 'win32')(
  'retains native signal handling with the runner PID',
  async () => {
    const { cwd, file } = fixture('console.log(process.pid);setInterval(()=>{},1000);');
    const child = spawn(process.execPath, [cli, file], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      const ready = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('runner did not become ready')), 5000);
        child.stdout!.once('data', (data) => {
          clearTimeout(timer);
          resolve(data.toString());
        });
        child.once('error', reject);
        child.once('exit', () => reject(new Error('exited before ready')));
      });
      expect(Number(ready.trim())).toBe(child.pid);
      const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (resolve) => child.once('close', (code, signal) => resolve({ code, signal })),
      );
      child.kill('SIGTERM');
      expect(await closed).toEqual({ code: null, signal: 'SIGTERM' });
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  },
);
