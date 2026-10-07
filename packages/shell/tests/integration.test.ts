import { afterEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  symlinkSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { TwillProject } from '@swiftuijs/twill/project';
import { emitDeclarations } from '@swiftuijs/twill/declarations';
import { format } from '@swiftuijs/twill-formatter';
import { exportProject } from '@swiftuijs/twill-export';
const require = createRequire(import.meta.url),
  roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'twill-shell-integration-'));
  roots.push(root);
  // Resolve through an isolated local package graph, not source-path aliases.
  const modules = join(root, 'node_modules');
  mkdirSync(join(modules, '@swiftuijs'), { recursive: true });
  for (const name of ['shell', 'twill'])
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
  for (const name of ['build.twill', 'main.twill'])
    copyFileSync(new URL(`../examples/${name}`, import.meta.url), join(source, name));
  writeFileSync(
    join(source, 'client.ts'),
    `import {build} from './build.twill'; export const run=()=>build(' a, b ');`,
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
  return { root, source, config };
}
it('checks, formats, declares and executes the real Twill script with source-mapped failure cleanup', async () => {
  const { root, source, config } = fixture(),
    project = new TwillProject(config);
  try {
    expect(project.diagnostics()).toEqual([]);
    const filename = join(source, 'build.twill'),
      original = readFileSync(filename, 'utf8');
    const formatted = await format(original);
    expect(await format(formatted)).toBe(formatted);
    const declarations = emitDeclarations(config, { outDir: join(root, 'declarations') });
    expect(declarations.diagnostics).toEqual([]);
    expect(readFileSync(join(root, 'declarations', 'build.d.ts'), 'utf8')).toContain(
      'Promise<BuildReport>',
    );
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '--enable-source-maps',
          '--import',
          '@swiftuijs/twill/register',
          join(source, 'main.twill'),
          ' x,中文;$(echo nope) ',
        ],
        { cwd: root, encoding: 'utf8' },
      ),
    );
    expect(result.items).toEqual(['x', '中文;$(echo nope)']);
    expect(result.tag).toBe('isolated');
    expect(existsSync(result.cwd)).toBe(false);
    const runner = join(root, 'failure.mjs');
    writeFileSync(
      runner,
      `import {build} from './source/build.twill';try{await build('item','fail');}catch(e){console.log(JSON.stringify({name:e.name,status:e.terminationStatus,output:e.standardOutput,error:e.standardError,stack:e.stack}));}`,
    );
    const failure = JSON.parse(
      execFileSync(
        process.execPath,
        ['--enable-source-maps', '--import', '@swiftuijs/twill/register', runner],
        { cwd: root, encoding: 'utf8' },
      ),
    );
    expect(failure).toMatchObject({
      name: 'ProcessExitError',
      status: { kind: 'exited', code: 7 },
      error: 'Build failed',
    });
    expect(existsSync(JSON.parse(failure.output).cwd)).toBe(false);
    // A successful native launch must leave ordinary declarations; validation points at dialect source.
    writeFileSync(
      join(source, 'bad.twill'),
      `import {Command,Output,Subprocess} from '@swiftuijs/twill-shell';\nconst result=await Subprocess.run(Command.path(process.execPath),{output:Output.text({limit:10})});\nresult.standardOutput.toFixed();\n`,
    );
    project.refresh(join(source, 'bad.twill'), true);
    const diagnostics = project.diagnostics();
    expect(diagnostics).toEqual([
      expect.objectContaining({
        filename: join(source, 'bad.twill').replaceAll('\\', '/'),
        line: 3,
        code: 2551,
      }),
    ]);
    writeFileSync(
      join(root, 'throw.twill'),
      `import {build} from './source/build.twill';\nawait build(undefined);`,
    );
    try {
      execFileSync(
        process.execPath,
        ['--enable-source-maps', '--import', '@swiftuijs/twill/register', 'throw.twill'],
        { cwd: root, encoding: 'utf8', stdio: 'pipe' },
      );
      throw Error('Expected failure');
    } catch (error: any) {
      expect(error.stderr).toContain(
        'build.twill:' +
          original.slice(0, original.indexOf('throw new TypeError')).split('\n').length +
          ':',
      );
      expect(error.stderr).toMatch(/throw\.twill:2:/);
    }
  } finally {
    project.dispose();
  }
});
it('exports the script and mixed TS graph for native execution without a compiler loader', async () => {
  const { root, source, config } = fixture();
  const outDir = join(root, 'native');
  const result = await exportProject(config, { outDir });
  expect(result.diagnostics).toEqual([]);
  expect(result.written).toBe(true);
  const code = readFileSync(join(outDir, 'build.ts'), 'utf8');
  expect(code).toMatch(/from ['"]@swiftuijs\/twill-shell['"]/);
  expect(code).not.toMatch(/\bguard const\b|\bdefer\s*\{/);
  const parsed = ts.getParsedCommandLineOfConfigFile(
    result.tsconfig,
    { noEmit: false, rewriteRelativeImportExtensions: true, outDir: join(root, 'dist') },
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic() {} },
  )!;
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  expect(
    ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
  ).toEqual([]);
  expect(program.emit().emitSkipped).toBe(false);
  const report = JSON.parse(
    execFileSync(process.execPath, [join(root, 'dist', 'main.js'), ' a, b '], {
      cwd: root,
      encoding: 'utf8',
    }),
  );
  expect(report.items).toEqual(['a', 'b']);
  expect(existsSync(report.cwd)).toBe(false);
  writeFileSync(
    join(root, 'mixed.mjs'),
    `import {run} from './dist/client.js';console.log(JSON.stringify(await run()));`,
  );
  expect(
    JSON.parse(execFileSync(process.execPath, ['mixed.mjs'], { cwd: root, encoding: 'utf8' }))
      .items,
  ).toEqual(['a', 'b']);
  expect(readFileSync(join(source, 'build.twill'), 'utf8')).toContain('guard const');
});
