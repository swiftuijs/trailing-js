import { afterEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { TwillProject } from '@swiftuijs/twill/project';
import { emitDeclarations } from '@swiftuijs/twill/declarations';
import { exportProject } from '@swiftuijs/twill-export';
import { format } from '@swiftuijs/twill-formatter';

const require = createRequire(import.meta.url),
  roots: string[] = [];
const cli = resolve(import.meta.dirname, '../../twill/bin/twill.mjs');
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'twill-native-integration-'));
  roots.push(root);
  const modules = join(root, 'node_modules');
  mkdirSync(join(modules, '@swiftuijs'), { recursive: true });
  for (const name of ['shell', 'shell-native', 'twill'])
    symlinkSync(
      resolve(import.meta.dirname, '../../', name),
      join(modules, '@swiftuijs', `twill${name === 'twill' ? '' : '-' + name}`),
      'junction',
    );
  mkdirSync(join(modules, '@types'));
  symlinkSync(
    resolve(require.resolve('@types/node/package.json'), '..'),
    join(modules, '@types/node'),
    'junction',
  );
  writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module', private: true }));
  const source = join(root, 'source');
  mkdirSync(source);
  const original = `import {Command,Output,Subprocess} from '@swiftuijs/twill-shell';
import {writeFile} from 'node:fs/promises';
export async function run(value: string | undefined): Promise<string> {
  guard const input = value else { throw new TypeError('Missing input'); }
  defer { await writeFile(new URL('../cleanup', import.meta.url), 'cleaned'); }
  const text = input.split(',').map { .trim(); }.join('|');
  const result = await Subprocess.run(Command.path(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)']), {input:text,output:Output.text({limit:1024})});
  return result.standardOutput;
}
`;
  writeFileSync(join(source, 'run.twill'), original);
  writeFileSync(
    join(source, 'main.twill'),
    `#!/usr/bin/env twill\nimport {run} from './run.twill';console.log(await run(process.argv[2]));`,
  );
  const config = join(source, 'tsconfig.json');
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        strict: true,
        skipLibCheck: true,
        types: ['node'],
        rootDir: '.',
      },
      include: ['**/*'],
    }),
  );
  return { root, source, config, original };
}

it('formats native-backed Twill source idempotently', async () => {
  const { original } = fixture();
  const formatted = await format(original);
  expect(await format(formatted)).toBe(formatted);
});

it('checks the native package through original Twill types', () => {
  const { config } = fixture();
  const project = new TwillProject(config);
  try {
    expect(project.diagnostics()).toEqual([]);
  } finally {
    project.dispose();
  }
});

it('emits ordinary TypeScript declarations for the native-backed script', () => {
  const { root, config } = fixture();
  const declarations = emitDeclarations(config, { outDir: join(root, 'types') });
  expect(declarations.diagnostics).toEqual([]);
  expect(readFileSync(join(root, 'types', 'run.d.ts'), 'utf8')).toContain('Promise<string>');
});

it('executes native-backed Twill guards/defer and maps original source failures', () => {
  const { root, source } = fixture();
  expect(
    execFileSync(process.execPath, [cli, join(source, 'main.twill'), ' a,中文;$(echo nope) '], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
  ).toBe('a|中文;$(echo nope)');
  expect(readFileSync(join(root, 'cleanup'), 'utf8')).toBe('cleaned');
  try {
    execFileSync(process.execPath, [cli, join(source, 'main.twill')], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    throw new Error('Expected missing-input failure');
  } catch (error) {
    const failure = error as Error & { stderr: string };
    expect(failure.stderr).toContain('TypeError: Missing input');
    expect(failure.stderr).toContain('run.twill:4:');
  }
});

it('exports a native-backed Twill script to checked JS that needs no compiler loader', async () => {
  const { root, config } = fixture();
  const exported = await exportProject(config, { outDir: join(root, 'native') });
  expect(exported.diagnostics).toEqual([]);
  expect(exported.written).toBe(true);
  expect(readFileSync(join(root, 'native', 'run.ts'), 'utf8')).toContain('@swiftuijs/twill-shell');
  const parsed = ts.getParsedCommandLineOfConfigFile(
    exported.tsconfig,
    { noEmit: false, rewriteRelativeImportExtensions: true, outDir: join(root, 'dist') },
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic() {} },
  )!;
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  expect(ts.getPreEmitDiagnostics(program)).toEqual([]);
  expect(program.emit().emitSkipped).toBe(false);
  expect(
    execFileSync(process.execPath, [join(root, 'dist', 'main.js'), ' a,b '], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
  ).toBe('a|b');
});

it('repeated cached and uncached Twill runner exits safely dispose the native reactor', () => {
  const { root, source } = fixture();
  const options = {
    cwd: root,
    encoding: 'utf8' as const,
    timeout: 15000,
    env: { ...process.env, TWILL_CACHE_DIR: join(root, 'cache'), TWILL_CACHE: '1' },
  };
  for (let i = 0; i < 48; i++) {
    expect(
      execFileSync(
        process.execPath,
        [cli, ...(i % 2 ? ['run'] : []), join(source, 'main.twill'), ' a,b '],
        { ...options, env: { ...options.env, TWILL_CACHE: i < 4 ? '0' : '1' } },
      ).trim(),
    ).toBe('a|b');
  }
}, 45000);
