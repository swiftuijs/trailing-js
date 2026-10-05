import { afterEach, expect, it, vi } from 'vitest';
import ts from 'typescript/lib/tsserverlibrary';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import init from '../src/typescript-plugin';
import { TwillProject, sourceFilename, virtualFilename } from '../src/project';

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});

it('bridge edits retain unrelated transforms, snapshots and native script versions', () => {
  const root = mkdtempSync(join(tmpdir(), 'twill-bridge-'));
  const config = join(root, 'tsconfig.json');
  const first = sourceFilename(join(root, 'first.twill'));
  const second = sourceFilename(join(root, 'second.twill'));
  const main = sourceFilename(join(root, 'main.ts'));
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        moduleResolution: 'Bundler',
        module: 'ESNext',
      },
      include: ['*'],
    }),
  );
  const disk = 'export const first = [1].map { n in n + 1 };';
  writeFileSync(first, disk);
  writeFileSync(second, 'export const second = [2].map { n in n + 2 };');
  writeFileSync(
    main,
    'import { first } from "./first"; import { second } from "./second"; export const result: number[][] = [first, second];',
  );
  const logs: string[] = [];
  const fallback = vi.fn(() => []);
  const update = vi.spyOn(TwillProject.prototype, 'update');
  const info = {
    project: {
      getProjectName: () => config,
      refreshDiagnostics: vi.fn(),
      projectService: {
        getScriptInfo: () => undefined,
        logger: { info: (text: string) => logs.push(text) },
      },
    },
    languageService: { getSemanticDiagnostics: fallback, dispose: vi.fn() },
    languageServiceHost: {
      getDefaultLibFileName: ts.getDefaultLibFilePath,
      getScriptFileNames: () => [main],
      getScriptVersion: () => '1',
      getScriptSnapshot: (file: string) =>
        existsSync(file) ? ts.ScriptSnapshot.fromString(readFileSync(file, 'utf8')) : undefined,
    },
  };
  const plugin = init({ typescript: ts });
  const service = plugin.create(info as unknown as ts.server.PluginCreateInfo);
  cleanups.push(() => {
    service.dispose();
    rmSync(root, { recursive: true, force: true });
  });
  expect(service.getSemanticDiagnostics(main)).toEqual([]);
  const project = update.mock.contexts[0] as TwillProject;
  const unrelated = project.transformed(second);
  const snapshot = project.service.getProgram()!.getSourceFile(virtualFilename(second));
  const overlay = disk.replace('n + 1', 'n + 3');
  update.mockClear();
  plugin.onConfigurationChanged!({ overlays: { [first]: overlay } });
  expect(update.mock.calls.map(([file]) => file)).toEqual([first]);
  expect(service.getSemanticDiagnostics(main)).toEqual([]);
  expect(project.transformed(second)).toBe(unrelated);
  expect(project.service.getProgram()!.getSourceFile(virtualFilename(second))).toBe(snapshot);
  const program = project.service.getProgram();
  update.mockClear();
  plugin.onConfigurationChanged!({ overlays: { [first]: overlay } });
  expect(update).not.toHaveBeenCalled();
  expect(project.service.getProgram()).toBe(program);
  plugin.onConfigurationChanged!({ overlays: {} });
  expect(update.mock.calls.map(([file]) => file)).toEqual([first]);
  expect(project.text(first)).toBe(disk);
  expect(service.getSemanticDiagnostics(main)).toEqual([]);
  expect(project.transformed(second)).toBe(unrelated);
  const dialectConfig = sourceFilename(join(root, 'twill.config.json'));
  plugin.onConfigurationChanged!({ overlays: { [first]: overlay } });
  update.mockClear();
  plugin.onConfigurationChanged!({
    overlays: { [first]: overlay },
    reloadFiles: [join(root, 'unrelated.json')],
  });
  expect(update).not.toHaveBeenCalled();
  expect(info.project.refreshDiagnostics).not.toHaveBeenCalled();
  writeFileSync(dialectConfig, '{"implicitReturn":false}');
  plugin.onConfigurationChanged!({ overlays: { [first]: overlay }, reloadFiles: [dialectConfig] });
  const replacement = update.mock.contexts.at(-1) as TwillProject;
  expect(replacement).not.toBe(project);
  expect(replacement.text(first)).toBe(overlay);
  expect(service.getSemanticDiagnostics(main).map((item) => item.code)).toContain(2322);
  writeFileSync(dialectConfig, '{"implicitReturn":true}');
  plugin.onConfigurationChanged!({ overlays: { [first]: overlay }, reloadFiles: [dialectConfig] });
  expect(service.getSemanticDiagnostics(main)).toEqual([]);
  expect((update.mock.contexts.at(-1) as TwillProject).text(first)).toBe(overlay);
  expect(info.project.refreshDiagnostics).toHaveBeenCalledTimes(2);
  expect(fallback).not.toHaveBeenCalled();
  expect(logs).toEqual([]);
});
