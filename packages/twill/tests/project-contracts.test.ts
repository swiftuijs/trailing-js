import { afterEach, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { TwillProject, virtualFilename } from '../src/project';
import { fixtureRoot } from './helpers/fixture';

const cleanups: (() => void)[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  cleanups.splice(0).forEach((cleanup) => cleanup());
});
function fixture(
  files: Record<string, string>,
  options: ts.CompilerOptions = {},
  extra: ConstructorParameters<typeof TwillProject>[2] = {},
) {
  const root = fixtureRoot('project-contracts-');
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
  const config = join(root, 'tsconfig.json');
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        types: [],
        ...options,
      },
      include: ['*'],
    }),
  );
  const project = new TwillProject(config, {}, extra);
  cleanups.push(() => {
    project.dispose();
    rmSync(root, { recursive: true, force: true });
  });
  const file = (name: string) => join(root, name).replaceAll('\\', '/');
  return {
    root,
    config,
    project,
    file,
    host: (project as unknown as { host: ts.LanguageServiceHost }).host,
  };
}

it('handles missing and unsaved snapshots, project versions and script case sensitivity', () => {
  const { project, host, file } = fixture({ 'main.twill': 'export const value=1;' });
  const missing = file('unsaved.ts');
  expect(host.readFile!(missing)).toBeUndefined();
  expect(host.getScriptSnapshot(missing)).toBeUndefined();
  expect(host.fileExists!(missing)).toBe(false);
  expect(host.getCurrentDirectory()).toBe(project.root);
  expect(host.getCompilationSettings()).toBe(project.compilerOptions);
  expect(host.useCaseSensitiveFileNames!()).toBe(ts.sys.useCaseSensitiveFileNames);
  const before = host.getProjectVersion!();
  project.update(missing, 'export const value=42;');
  expect(host.fileExists!(missing)).toBe(true);
  const snapshot = host.getScriptSnapshot(missing)!;
  expect(snapshot.getText(0, snapshot.getLength())).toContain('42');
  expect(host.getProjectVersion!()).not.toBe(before);
  expect(host.getScriptVersion(missing)).toMatch(/:1$/);
});
it('resolves explicit dialect files and returns diagnostics for unknown modules', () => {
  const { project, file } = fixture({
    'api.twill': 'export const value=42;',
    'main.twill': 'import {value} from "./api.twill"; export const selected:number=value;',
  });
  expect(project.diagnostics()).toEqual([]);
  project.update(
    file('main.twill'),
    'import {missing} from "unknown-package"; export const value=missing;',
  );
  expect(project.diagnostics(file('main.twill'))).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 2307 })]),
  );
});
it.each(['api.ts', 'api.twill'])('redirects %s to the checked dependency declaration', (name) => {
  const root = fixtureRoot('redirect-contract-');
  const file = (name: string) => join(root, name).replaceAll('\\', '/');
  const config = file('tsconfig.json');
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        types: [],
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
      },
      files: ['main.twill'],
    }),
  );
  writeFileSync(file(name), 'export const value="source only";');
  writeFileSync(file('checked.d.ts'), 'export declare const value:number;');
  writeFileSync(
    file('main.twill'),
    `import {value} from "./${name}";export const selected:number=value;`,
  );
  const project = new TwillProject(
    config,
    {},
    { declarationRedirects: new Map([[file(name), file('checked.d.ts')]]) },
  );
  cleanups.push(() => {
    project.dispose();
    rmSync(root, { recursive: true, force: true });
  });
  expect(project.diagnostics()).toEqual([]);
  expect(project.service.getProgram()!.getSourceFile(file('checked.d.ts'))).toBeDefined();
});
it('keeps unmapped empty-file offsets bounded and skips declaration-only diagnostics', () => {
  const { project, file } = fixture({
    'empty.twill': '',
    'types.d.ts': 'declare const value: number;',
  });
  expect(project.toGeneratedOffset(file('empty.twill'), 2)).toBe(2);
  expect(project.toOriginalOffset(file('empty.twill'), 2)).toBe(0);
  expect(project.diagnostics(file('types.d.ts'))).toEqual([]);
  expect(project.diagnostics(file('absent.twill'))).toEqual(
    expect.arrayContaining([expect.objectContaining({ line: 1, column: 0, code: 90001 })]),
  );
});
it('maps optional locations and non-error backend diagnostics without losing the source', () => {
  const source = 'export const output=[1].map { n in n + 1 };';
  const { project, file } = fixture({ 'main.twill': source });
  const filename = file('main.twill');
  const sf = project.service.getProgram()!.getSourceFile(virtualFilename(filename))!;
  const start = project.toGeneratedOffset(filename, source.indexOf('n + 1'));
  vi.spyOn(project.service, 'getSyntacticDiagnostics').mockReturnValue([
    {
      file: sf,
      start,
      length: 1,
      category: ts.DiagnosticCategory.Warning,
      code: 1001,
      messageText: 'warning',
    },
  ]);
  vi.spyOn(project.service, 'getSemanticDiagnostics').mockReturnValue([
    {
      file: sf,
      start: undefined,
      length: undefined,
      category: ts.DiagnosticCategory.Message,
      code: 1002,
      messageText: 'message',
    },
  ]);
  const diagnostics = project.diagnostics(filename);
  expect(diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        filename,
        line: 1,
        column: source.indexOf('n + 1'),
        length: 1,
        category: 'warning',
        message: 'warning',
      }),
      expect.objectContaining({
        filename,
        line: 1,
        column: 0,
        category: 'message',
        message: 'message',
      }),
    ]),
  );
});
it('contains backend request failures and missing programs during declaration emission', () => {
  const { project, file } = fixture({ 'main.twill': 'export const value=1;' });
  vi.spyOn(project.service, 'getSyntacticDiagnostics').mockImplementation(() => {
    throw new Error('backend request failed');
  });
  expect(project.diagnostics(file('main.twill'))).toEqual([
    expect.objectContaining({ line: 1, column: 0, code: 90001, message: 'backend request failed' }),
  ]);
  vi.restoreAllMocks();
  vi.spyOn(project.service, 'getProgram').mockReturnValue(undefined);
  expect(project.sourceFiles()).toEqual([file('main.twill')]);
  vi.spyOn(project, 'diagnostics').mockReturnValue([]);
  expect(project.declarationOutput(file('types'))).toEqual({ diagnostics: [], files: [] });
});
it('detects declaration-only type errors before writing output', () => {
  const { project, file } = fixture({
    'main.twill': 'export const instance = new class { private member=1; }();',
  });
  expect(project.diagnostics()).toEqual([]);
  const result = project.declarationOutput(file('types'));
  expect(result.files).toEqual([]);
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 4094 })]),
  );
});
it('refreshes discovery after a config is removed without masking its diagnostic', () => {
  const { project, config, file } = fixture({ 'main.twill': 'export const value=1;' });
  rmSync(config);
  writeFileSync(file('later.twill'), 'export const later=2;');
  project.refresh(file('later.twill'), true);
  expect(project.sourceFiles()).toContain(file('later.twill'));
  const missing = new TwillProject(config);
  try {
    expect(missing.diagnostics()).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 5083, category: 'error' })]),
    );
  } finally {
    missing.dispose();
  }
});
