import type ts from 'typescript/lib/tsserverlibrary';
import { statSync } from 'node:fs';
import { TwillProject, sourceFilename, virtualFilename } from './project.js';
import { isTwillFile } from './compiler.js';
import { TwillEditor } from './editor.js';

/** Semantic bridge for native TS/JS documents in configured mixed projects. */
export default function init(_modules: { typescript: typeof ts }): ts.server.PluginModule {
  type Context = {
    project: TwillProject;
    info: ts.server.PluginCreateInfo;
    versions: Map<string, string>;
    editor: TwillEditor;
    protocolOverlays: Set<string>;
  };
  const contexts = new Map<ts.server.Project, Context>();
  let overlays: Record<string, string> = {};
  const syncProtocolSource = (context: Context, file: string, text: string | undefined) => {
    // TS-server converts plugin offsets into protocol line/column positions
    // using its own ScriptInfo. Keep that text aligned with the virtual
    // project even though custom documents use Twill's editor providers.
    const info = context.info.project.projectService.getScriptInfo(file);
    if (!info || info.isScriptOpen()) return;
    if (text === undefined) {
      if (context.protocolOverlays.delete(file)) info.reloadFromFile();
      return;
    }
    const snapshot = info.getSnapshot();
    if (snapshot.getText(0, snapshot.getLength()) !== text) {
      info.editContent(0, snapshot.getLength(), text);
      context.protocolOverlays.add(file);
    }
  };
  const sync = (context: Context) => {
    const { project, info, versions } = context;
    const tracked = new Set(info.languageServiceHost.getScriptFileNames().map(sourceFilename));
    for (const file of new Set([...project.sourceFiles(), ...tracked])) {
      if (/\.d\.[cm]?ts$/.test(file)) continue;
      const original = sourceFilename(file);
      if (overlays[original] !== undefined) {
        syncProtocolSource(context, original, overlays[original]);
        project.update(original, overlays[original]);
        continue;
      }
      let version: string;
      try {
        if (tracked.has(original)) version = info.languageServiceHost.getScriptVersion(file);
        else {
          const stat = statSync(original);
          version = `${stat.mtimeMs}:${stat.size}`;
        }
      } catch {
        // New unsaved native documents need not exist on disk yet.
        const snapshot = !isTwillFile(original) && info.languageServiceHost.getScriptSnapshot(file);
        if (snapshot) project.update(original, snapshot.getText(0, snapshot.getLength()));
        continue;
      }
      if (versions.get(original) === version) continue;
      versions.set(original, version);
      const snapshot = info.languageServiceHost.getScriptSnapshot(file);
      // Native snapshots include unsaved TS/JS changes. Dialect files are
      // owned by the Twill editor, with overlays delivered through config.
      project.update(
        original,
        !isTwillFile(original) && snapshot ? snapshot.getText(0, snapshot.getLength()) : undefined,
      );
    }
  };
  const span = (context: Context, file: string, value: ts.TextSpan): ts.TextSpan => {
    const start = context.project.toOriginalOffset(file, value.start);
    const end = context.project.toOriginalOffset(file, value.start + value.length);
    return { start, length: Math.max(0, end - start) };
  };
  const entry = <T extends { fileName: string; textSpan: ts.TextSpan }>(
    context: Context,
    value: T,
  ): T => ({
    ...value,
    fileName: sourceFilename(value.fileName),
    textSpan: span(context, value.fileName, value.textSpan),
    ...('contextSpan' in value && value.contextSpan
      ? { contextSpan: span(context, value.fileName, value.contextSpan as ts.TextSpan) }
      : {}),
  });
  const diagnostic = (context: Context, value: ts.Diagnostic): ts.Diagnostic => {
    const file = value.file && sourceFilename(value.file.fileName);
    const location =
      value.file && value.start !== undefined
        ? span(context, value.file.fileName, { start: value.start, length: value.length ?? 0 })
        : {};
    return {
      ...value,
      ...location,
      file:
        file && isTwillFile(file)
          ? _modules.typescript.createSourceFile(
              file,
              context.project.text(file) ?? '',
              _modules.typescript.ScriptTarget.Latest,
            )
          : value.file,
      relatedInformation: value.relatedInformation?.map(
        (item) => diagnostic(context, item) as ts.DiagnosticRelatedInformation,
      ),
    };
  };
  return {
    create(info) {
      const config = info.project.getProjectName();
      if (!/\.json$/.test(config)) return info.languageService;
      const project = new TwillProject(
        config,
        {},
        {
          defaultLibFileName: (options) => info.languageServiceHost.getDefaultLibFileName(options),
        },
      );
      const context: Context = {
        project,
        info,
        versions: new Map(),
        editor: new TwillEditor(project),
        protocolOverlays: new Set(),
      };
      contexts.set(info.project, context);
      const proxy = Object.create(null) as ts.LanguageService;
      for (const key of Object.keys(info.languageService) as (keyof ts.LanguageService)[]) {
        const method = info.languageService[key];
        (proxy as any)[key] =
          typeof method === 'function' ? method.bind(info.languageService) : method;
      }
      const use = (
        key: keyof ts.LanguageService,
        execute: (file: string, ...args: any[]) => any,
      ) => {
        const original = (proxy as any)[key];
        (proxy as any)[key] = (file: string, ...args: any[]) => {
          try {
            sync(context);
            if (!context.project.sourceFiles().some(isTwillFile)) return original(file, ...args);
            return execute(file, ...args);
          } catch (error) {
            info.project.projectService.logger.info(`Twill ${String(key)}: ${error}`);
            if (key === 'findRenameLocations') return undefined;
            if (key === 'getRenameInfo')
              return {
                canRename: false,
                localizedErrorMessage: 'Twill could not safely map this rename.',
              };
            return original(file, ...args);
          }
        };
      };
      const service = context.project.service;
      for (const key of [
        'getQuickInfoAtPosition',
        'getCompletionsAtPosition',
        'getCompletionEntryDetails',
        'getSignatureHelpItems',
      ] as const)
        use(key, (file, offset, ...args) =>
          (service[key] as any)(
            virtualFilename(file),
            context.project.toGeneratedOffset(file, offset),
            ...args,
          ),
        );
      for (const key of [
        'getDefinitionAtPosition',
        'getTypeDefinitionAtPosition',
        'getImplementationAtPosition',
      ] as const)
        use(key, (file, offset) =>
          service[key](virtualFilename(file), context.project.toGeneratedOffset(file, offset))?.map(
            (value) => entry(context, value),
          ),
        );
      use('getDefinitionAndBoundSpan', (file, offset) => {
        const result = service.getDefinitionAndBoundSpan(
          virtualFilename(file),
          context.project.toGeneratedOffset(file, offset),
        );
        return (
          result && {
            textSpan: span(context, file, result.textSpan),
            definitions: result.definitions?.map((value) => entry(context, value)),
          }
        );
      });
      use('getRenameInfo', (file, offset) => context.editor.renameInfo(file, offset));
      use('findRenameLocations', (file, offset, strings, comments, preferences) => {
        if (strings || comments) return undefined;
        return context.editor.renameLocations(file, offset, preferences ?? true);
      });
      const toChanges = (edits: ReturnType<TwillEditor['mapChanges']>) => {
        if (!edits) return undefined;
        const files = new Map<string, { fileName: string; textChanges: ts.TextChange[] }>();
        for (const edit of edits) {
          let file = files.get(edit.filename);
          if (!file)
            files.set(edit.filename, (file = { fileName: edit.filename, textChanges: [] }));
          file.textChanges.push({ span: edit.span, newText: edit.newText });
        }
        return [...files.values()];
      };
      use('getCompletionEntryDetails', (file, offset, ...args) => {
        const details = (service.getCompletionEntryDetails as any)(
          virtualFilename(file),
          context.project.toGeneratedOffset(file, offset),
          ...args,
        ) as ts.CompletionEntryDetails | undefined;
        if (!details) return details;
        return {
          ...details,
          codeActions: details.codeActions?.flatMap((action) => {
            const changes = toChanges(context.editor.mapChanges(action.changes));
            return changes ? [{ ...action, changes }] : [];
          }),
        };
      });
      // OrganizeImports takes a scope object rather than a filename, so it
      // cannot use the generic native-document request wrapper above.
      const originalOrganize = proxy.organizeImports;
      proxy.organizeImports = (scope, format, preferences) => {
        try {
          sync(context);
          if (!context.project.sourceFiles().some(isTwillFile))
            return originalOrganize(scope, format, preferences);
          const changes = service.organizeImports(
            { ...scope, fileName: virtualFilename(scope.fileName) },
            format,
            preferences,
          );
          return toChanges(context.editor.mapChanges(changes)) ?? [];
        } catch (error) {
          info.project.projectService.logger.info(`Twill organizeImports: ${error}`);
          return [];
        }
      };
      for (const key of ['getSemanticDiagnostics', 'getSyntacticDiagnostics'] as const)
        use(key, (file) =>
          service[key](virtualFilename(file)).map((value) => diagnostic(context, value)),
        );
      const dispose = proxy.dispose;
      proxy.dispose = () => {
        for (const file of context.protocolOverlays) syncProtocolSource(context, file, undefined);
        contexts.delete(info.project);
        context.project.dispose();
        dispose();
      };
      return proxy;
    },
    getExternalFiles(project) {
      const context = contexts.get(project);
      return context?.project.sourceFiles().filter(isTwillFile) ?? [];
    },
    onConfigurationChanged(config) {
      const incoming = config?.overlays;
      overlays =
        incoming && typeof incoming === 'object'
          ? (Object.fromEntries(
              Object.entries(incoming).filter(
                ([file, text]) => isTwillFile(file) && typeof text === 'string',
              ),
            ) as Record<string, string>)
          : {};
      for (const context of contexts.values()) {
        for (const file of context.project.sourceFiles())
          if (isTwillFile(file)) {
            syncProtocolSource(context, file, overlays[file]);
            context.project.update(file, overlays[file]);
          }
        for (const [file, text] of Object.entries(overlays))
          if (file.startsWith(sourceFilename(context.project.root) + '/'))
            context.project.update(file, text);
        context.versions.clear();
      }
    },
  };
}
