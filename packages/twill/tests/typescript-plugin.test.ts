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
      getScriptVersion: (_file: string) => '1',
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

function bridgeFixture(files: Record<string, string>, initialConfig?: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), 'twill-bridge-requests-'));
  const config = join(root, 'tsconfig.json');
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
      include: ['*'],
    }),
  );
  const sources = new Map(
    Object.entries(files).map(([name, source]) => [sourceFilename(join(root, name)), source]),
  );
  for (const [file, text] of sources) writeFileSync(file, text);
  const fallback = vi.fn(() => []);
  const logs: string[] = [];
  const scriptInfo = new Map(
    [...sources].map(([file, text]) => {
      let current = text;
      return [
        file,
        {
          isScriptOpen: (): boolean => false,
          getSnapshot: () => ts.ScriptSnapshot.fromString(current),
          editContent: vi.fn((start: number, end: number, text: string) => {
            current = current.slice(0, start) + text + current.slice(end);
          }),
          reloadFromFile: vi.fn(() => {
            current = readFileSync(file, 'utf8');
          }),
        },
      ] as const;
    }),
  );
  const info = {
    config: initialConfig,
    project: {
      getProjectName: () => config,
      refreshDiagnostics: vi.fn(),
      projectService: {
        getScriptInfo: (file: string) => scriptInfo.get(file),
        logger: { info: (text: string) => logs.push(text) },
      },
    },
    languageService: Object.fromEntries(
      [
        'getSemanticDiagnostics',
        'getSyntacticDiagnostics',
        'getQuickInfoAtPosition',
        'getCompletionsAtPosition',
        'getCompletionEntryDetails',
        'getSignatureHelpItems',
        'getDefinitionAtPosition',
        'getTypeDefinitionAtPosition',
        'getImplementationAtPosition',
        'getDefinitionAndBoundSpan',
        'getRenameInfo',
        'findRenameLocations',
        'findReferences',
        'getReferencesAtPosition',
        'organizeImports',
        'dispose',
      ].map((key) => [key, fallback]),
    ),
    languageServiceHost: {
      getDefaultLibFileName: ts.getDefaultLibFilePath,
      getScriptFileNames: () => [...sources.keys()],
      getScriptVersion: (_file: string) => '1',
      getScriptSnapshot: (file: string) =>
        sources.has(file) ? ts.ScriptSnapshot.fromString(sources.get(file)!) : undefined,
    },
  };
  const plugin = init({ typescript: ts });
  const service = plugin.create(info as unknown as ts.server.PluginCreateInfo);
  cleanups.push(() => {
    service.dispose();
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    config,
    info,
    plugin,
    service,
    sources,
    scriptInfo,
    fallback,
    logs,
    file: (name: string) => sourceFilename(join(root, name)),
  };
}

it('maps TS-server completion, hover and signature spans for Twill source coordinates', () => {
  const source = 'const users=[{name:"Ada",active:true}]; export const names=users.map { .na };';
  const { service, file } = bridgeFixture({ 'members.twill': source });
  const position = source.indexOf('.na') + 3;
  const completion = service.getCompletionsAtPosition(file('members.twill'), position, {});
  expect(completion?.isMemberCompletion).toBe(true);
  expect(completion?.entries.map((entry) => entry.name)).toContain('name');
  expect(completion?.optionalReplacementSpan).toEqual({ start: position - 2, length: 2 });
  const info = service.getQuickInfoAtPosition(file('members.twill'), source.indexOf('users.map'));
  expect(info?.textSpan).toEqual({ start: source.indexOf('users.map'), length: 5 });
});
it('maps mixed navigation, references, rename and import actions without virtual filenames', () => {
  const source = 'export function twice(value:number){return [value].map { n in n * 2 }[0]!;}';
  const native = 'import {twice} from "./api.twill"; export const result=twice(2);';
  const { service, file } = bridgeFixture({
    'api.twill': source,
    'main.ts': native,
    'auto.ts': 'export const result=twice(2);',
  });
  const offset = native.lastIndexOf('twice');
  for (const definitions of [
    service.getDefinitionAtPosition(file('main.ts'), offset),
    service.getDefinitionAndBoundSpan(file('main.ts'), offset)?.definitions,
  ]) {
    expect(definitions?.[0]).toMatchObject({
      fileName: file('api.twill'),
      textSpan: { start: source.indexOf('twice'), length: 5 },
    });
  }
  expect(service.getTypeDefinitionAtPosition(file('main.ts'), offset)).toBeDefined();
  service.getImplementationAtPosition(file('main.ts'), offset);
  expect(
    service
      .findReferences(file('main.ts'), offset)
      ?.flatMap((group) => group.references.map((entry) => entry.fileName)),
  ).toContain(file('api.twill'));
  expect(
    service
      .getReferencesAtPosition(file('main.ts'), offset)
      ?.some((entry) => entry.fileName === file('api.twill')),
  ).toBe(true);
  expect(service.getRenameInfo(file('main.ts'), offset, {}).canRename).toBe(true);
  expect(
    service.findRenameLocations(file('main.ts'), offset, false, false, true)?.length,
  ).toBeGreaterThan(1);
  expect(service.findRenameLocations(file('main.ts'), offset, true, false, true)).toBeUndefined();
  const auto = file('auto.ts');
  const completions = service.getCompletionsAtPosition(auto, 24, {
    includeCompletionsForModuleExports: true,
  });
  const entry = completions?.entries.find((entry) => entry.name === 'twice' && entry.source)!;
  expect(entry).toBeDefined();
  const details = service.getCompletionEntryDetails(
    auto,
    24,
    entry.name,
    {},
    entry.source,
    {},
    entry.data,
  );
  expect(details?.codeActions?.[0]?.changes?.[0]?.textChanges[0]?.newText).not.toContain(
    '.twill.ts',
  );
  expect(
    service
      .organizeImports({ type: 'file', fileName: file('main.ts') }, {}, {})
      .every((change) => !change.fileName.includes('.twill.ts')),
  ).toBe(true);
  expect(
    service.getSignatureHelpItems(file('main.ts'), native.lastIndexOf('(2') + 1, undefined)?.items,
  ).toHaveLength(1);
});
it('keeps protocol overlays aligned, restores disk sources and ignores invalid overlay entries', () => {
  const source = 'export const value=[1].map { n in n + 1 };';
  const { plugin, service, file, scriptInfo, sources, info } = bridgeFixture({
    'api.twill': source,
    'main.ts': 'import {value} from "./api.twill"; export const result:number[]=value;',
  });
  const api = file('api.twill');
  const overlay = source.replace('n + 1', 'n + 3');
  plugin.onConfigurationChanged!({
    overlays: { [api]: overlay, [file('main.ts')]: 'bad native overlay', invalid: 1 },
  });
  expect(scriptInfo.get(api)?.editContent).toHaveBeenCalled();
  expect(service.getSemanticDiagnostics(file('main.ts'))).toEqual([]);
  expect(plugin.getExternalFiles!(info.project as unknown as ts.server.Project, 0)).toContain(api);
  plugin.onConfigurationChanged!({ overlays: null });
  expect(scriptInfo.get(api)?.reloadFromFile).toHaveBeenCalled();
  sources.set(file('new.ts'), 'export const value=1;');
  expect(service.getSyntacticDiagnostics(file('new.ts'))).toEqual([]);
});
it('preserves native services in inferred or pure-native projects and safely falls back on project failures', () => {
  const native = bridgeFixture({ 'main.ts': 'export const value=1;' });
  expect(native.service.getSemanticDiagnostics(native.file('main.ts'))).toEqual([]);
  expect(native.fallback).toHaveBeenCalled();
  expect(
    native.service.organizeImports({ type: 'file', fileName: native.file('main.ts') }, {}, {}),
  ).toEqual([]);
  const inferredInfo = {
    ...native.info,
    project: { ...native.info.project, getProjectName: () => '/dev/null/inferredProject1*' },
  };
  expect(native.plugin.create(inferredInfo as unknown as ts.server.PluginCreateInfo)).toBe(
    inferredInfo.languageService,
  );
  const dialect = bridgeFixture({ 'main.twill': 'export const value=1;' });
  vi.spyOn(TwillProject.prototype, 'sourceFiles').mockImplementation(() => {
    throw new Error('project unavailable');
  });
  expect(dialect.service.getQuickInfoAtPosition(dialect.file('main.twill'), 13)).toEqual([]);
  expect(
    dialect.service.findRenameLocations(dialect.file('main.twill'), 13, false, false),
  ).toBeUndefined();
  expect(dialect.service.getRenameInfo(dialect.file('main.twill'), 13, {})).toMatchObject({
    canRename: false,
  });
  expect(
    dialect.service.organizeImports({ type: 'file', fileName: dialect.file('main.twill') }, {}, {}),
  ).toEqual([]);
  expect(dialect.logs.join('\n')).toContain('project unavailable');
});

it('uses initial protocol overrides and preserves text owned by an open ScriptInfo', () => {
  const rootSpy = vi.spyOn(TwillProject.prototype, 'sourceFiles');
  const state = bridgeFixture({
    'api.twill': 'export const value=1;',
    'main.ts': 'import {value} from "./api.twill";export const result:number=value;',
  });
  const api = state.file('api.twill');
  const protocol = state.scriptInfo.get(api)!;
  vi.spyOn(protocol, 'isScriptOpen').mockReturnValue(true);
  state.plugin.onConfigurationChanged!({ overlays: { [api]: 'export const value=2;' } });
  expect(protocol.editContent).not.toHaveBeenCalled();
  expect(state.service.getSemanticDiagnostics(state.file('main.ts'))).toEqual([]);
  const project = rootSpy.mock.contexts[0] as TwillProject;
  expect(project.text(api)).toBe('export const value=2;');
  vi.mocked(protocol.isScriptOpen).mockReturnValue(false);
  state.plugin.onConfigurationChanged!({ overlays: { [api]: 'export const value=1;' } });
  expect(protocol.editContent).not.toHaveBeenCalled();
  expect(state.plugin.getExternalFiles!({} as ts.server.Project, 0)).toEqual([]);
  const initial = bridgeFixture(
    { 'api.twill': 'export const value=1;', 'main.ts': 'export const value=1;' },
    { overlays: { invalid: 3 } },
  );
  expect(initial.service.getSemanticDiagnostics(initial.file('main.ts'))).toEqual([]);
  expect(initial.logs).toEqual([]);
});

it('reads new unsaved native snapshots even when the host cannot stat or version the file', () => {
  const state = bridgeFixture({ 'api.twill': 'export const value=1;' });
  const unsaved = state.file('unsaved.ts');
  state.sources.set(unsaved, 'export const value:number=42;');
  vi.spyOn(state.info.languageServiceHost, 'getScriptVersion').mockImplementation((file) => {
    if (file === unsaved) throw new Error('no disk version');
    return '1';
  });
  expect(
    state.service
      .getQuickInfoAtPosition(unsaved, 13)
      ?.displayParts?.map((part) => part.text)
      .join(''),
  ).toContain('number');
  state.sources.set(state.file('missing.twill'), 'export const value=1;');
  vi.mocked(state.info.languageServiceHost.getScriptVersion).mockImplementation(() => {
    throw new Error('file removed');
  });
  expect(state.service.getSyntacticDiagnostics(state.file('api.twill'))).toEqual([]);
});

it('maps related diagnostic source files and preserves diagnostics without positions', () => {
  const captured = vi.spyOn(TwillProject.prototype, 'sourceFiles');
  const state = bridgeFixture({ 'first.twill': 'const shared=1;', 'second.ts': 'const shared=2;' });
  const diagnostics = state.service.getSemanticDiagnostics(state.file('second.ts'));
  const duplicate = diagnostics.find((item) => item.code === 2451)!;
  expect(
    duplicate.relatedInformation?.some((item) => item.file?.fileName === state.file('first.twill')),
  ).toBe(true);
  const project = captured.mock.contexts[0] as TwillProject;
  const sf = project.service
    .getProgram()!
    .getSourceFile(virtualFilename(state.file('first.twill')))!;
  vi.spyOn(project.service, 'getSemanticDiagnostics').mockReturnValue([
    {
      file: sf,
      category: ts.DiagnosticCategory.Warning,
      code: 1234,
      messageText: 'no position',
      start: undefined,
      length: undefined,
      relatedInformation: [
        {
          file: undefined,
          category: ts.DiagnosticCategory.Message,
          code: 1235,
          messageText: 'related',
          start: undefined,
          length: undefined,
        },
      ],
    },
    {
      file: undefined,
      start: undefined,
      length: undefined,
      category: ts.DiagnosticCategory.Message,
      code: 1236,
      messageText: 'global',
    },
  ]);
  const mapped = state.service.getSemanticDiagnostics(state.file('first.twill'));
  expect(mapped[0]!.file?.text).toBe('const shared=1;');
  expect(mapped[0]!.start).toBeUndefined();
  expect(mapped[0]!.relatedInformation?.[0]?.messageText).toBe('related');
  expect(mapped[1]!.file).toBeUndefined();
});

it('returns absent semantic results and rejects backend edits into generated closure syntax', () => {
  const captured = vi.spyOn(TwillProject.prototype, 'sourceFiles');
  const state = bridgeFixture({ 'main.twill': 'export const values=[1].map { n in n + 1 };' });
  const file = state.file('main.twill');
  expect(state.service.getQuickInfoAtPosition(file, 0)).toBeUndefined();
  expect(state.service.getSignatureHelpItems(file, 0, undefined)).toBeUndefined();
  expect(
    state.service.getCompletionEntryDetails(file, 0, 'notAnEntry', {}, undefined, {}, undefined),
  ).toBeUndefined();
  expect(state.service.findRenameLocations(file, 13, false, false)?.length).toBeGreaterThan(0);
  const project = captured.mock.contexts[0] as TwillProject;
  const code = project.transformed(file)!.code;
  const changes = [
    {
      fileName: virtualFilename(file),
      textChanges: [{ span: { start: code.indexOf('=>'), length: 2 }, newText: 'unsafe' }],
    },
  ];
  vi.spyOn(project.service, 'organizeImports').mockReturnValue(changes);
  expect(state.service.organizeImports({ type: 'file', fileName: file }, {}, {})).toEqual([]);
  vi.spyOn(project.service, 'getCompletionEntryDetails').mockReturnValue({
    name: 'entry',
    kind: ts.ScriptElementKind.constElement,
    kindModifiers: '',
    displayParts: [],
    codeActions: [{ description: 'unsafe', changes }],
  });
  expect(
    state.service.getCompletionEntryDetails(file, 13, 'entry', {}, undefined, {}, undefined)
      ?.codeActions,
  ).toEqual([]);
  vi.spyOn(project.service, 'getCompletionsAtPosition').mockReturnValue(undefined);
  expect(state.service.getCompletionsAtPosition(file, 13, {})).toBeUndefined();
});

it('reloads package-resolution state, ignores foreign overlays and retains the working project after invalid config', () => {
  const state = bridgeFixture({ 'main.twill': 'export const value=1;' });
  state.service.getSemanticDiagnostics(state.file('main.twill'));
  state.plugin.onConfigurationChanged!({
    overlays: { [join(state.root, '../foreign.twill')]: 'export const foreign=1;' },
    reloadFiles: [state.file('package.json'), 42],
  });
  expect(state.info.project.refreshDiagnostics).toHaveBeenCalledOnce();
  expect(
    state.plugin.getExternalFiles!(state.info.project as unknown as ts.server.Project, 0),
  ).not.toContain(join(state.root, '../foreign.twill'));
  writeFileSync(state.file('twill.config.json'), '{"implicitReturn":"bad"}');
  state.plugin.onConfigurationChanged!({ reloadFiles: [state.file('twill.config.json')] });
  expect(state.logs.join('\n')).toContain('configuration reload');
  expect(state.service.getSemanticDiagnostics(state.file('main.twill'))).toEqual([]);
});
