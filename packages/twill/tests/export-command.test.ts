import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});
function fixture(source?: string, exported = true) {
  // Outside the workspace: resolving an optional tool must not accidentally
  // succeed through a development checkout's node_modules.
  const root = mkdtempSync(join(tmpdir(), 'twill-export-command-'));
  roots.push(root);
  const config = join(root, 'tsconfig.json');
  writeFileSync(config, '{}');
  const pkg = join(root, 'node_modules/@swiftuijs/twill-export');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({
      name: '@swiftuijs/twill-export',
      type: 'module',
      exports: exported ? { './cli': { import: './cli.js', default: './cli.js' } } : {},
    }),
  );
  if (source !== undefined) {
    writeFileSync(join(pkg, 'cli.js'), source);
  }
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  return { root, config, log };
}
it('lists export in root help without loading optional tooling', async () => {
  const { log } = fixture();
  expect(await main(['--help'])).toBe(0);
  expect(log).toHaveBeenCalledWith(expect.stringContaining('twill export'));
  expect(log).toHaveBeenCalledWith(expect.stringContaining('optional @swiftuijs/twill-export'));
});
it('explains installation when the selected project has no export CLI entry', async () => {
  const { config } = fixture();
  await expect(main(['export', '-p', config, '-o', '../native'])).rejects.toThrow(
    'pnpm add -D @swiftuijs/twill-export',
  );
});
it('resolves from the selected project and preserves all arguments and the exit status', async () => {
  const { config, log } = fixture(
    'export async function main(args){console.log(JSON.stringify(args));return 7;}',
  );
  const args = ['export', '-p', config, '-o', '../native', '--dry-run', '--json'];
  expect(await main(args)).toBe(7);
  expect(JSON.parse(log.mock.calls.at(-1)![0])).toEqual(args.slice(1));
  expect(args[0]).toBe('export');
});
it('distinguishes a command token from an option value and delegates command help', async () => {
  const { root, log } = fixture(
    'export async function main(args){console.log(JSON.stringify(args));return 0;}',
  );
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  expect(await main(['-p', 'export', 'export', '--help'])).toBe(0);
  expect(JSON.parse(log.mock.calls.at(-1)![0])).toEqual(['-p', 'export', '--help']);
  expect(await main(['export', '--help'])).toBe(0);
  expect(JSON.parse(log.mock.calls.at(-1)![0])).toEqual(['--help']);
});
it('preserves export and execution errors instead of suggesting an unrelated reinstall', async () => {
  const unavailable = fixture('export async function main(){return 0;}', false);
  await expect(main(['export', '-p', unavailable.config, '--help'])).rejects.toMatchObject({
    code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
  });
  const broken = fixture('throw new Error("Export module failed to initialize");');
  await expect(main(['export', '-p', broken.config, '--help'])).rejects.toThrow(
    'Export module failed to initialize',
  );
  const failure = fixture(
    'export async function main(){throw new Error("Destination already exists");}',
  );
  await expect(main(['export', '-p', failure.config, '-o', '../native'])).rejects.toThrow(
    'Destination already exists',
  );
});
it('rejects export-only flags on other commands', async () => {
  await expect(main(['check', '--dry-run'])).rejects.toThrow('only supported by twill export');
});
