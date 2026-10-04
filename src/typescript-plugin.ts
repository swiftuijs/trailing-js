import type ts from 'typescript/lib/tsserverlibrary';
import { statSync } from 'node:fs';
import { TwillProject, sourceFilename, virtualFilename } from './project';
import { isTwillFile } from './compiler';

/** Read-only bridge for native TS/JS documents in configured mixed projects. */
export default function init(_modules: { typescript: typeof ts }): ts.server.PluginModule {
  type Context = {
    project: TwillProject;
    info: ts.server.PluginCreateInfo;
    versions: Map<string, string>;
  };
  const contexts = new Map<ts.server.Project, Context>();
  let overlays: Record<string, string> = {};
  const sync = (context: Context) => {
    const { project, info, versions } = context;
    const tracked = new Set(info.languageServiceHost.getScriptFileNames().map(sourceFilename));
    for (const file of new Set([...project.sourceFiles(), ...tracked])) {
      if (/\.d\.[cm]?ts$/.test(file)) continue;
      const original = sourceFilename(file);
      if (overlays[original] !== undefined) {
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
      const context: Context = {
        project: new TwillProject(
          config,
          {},
          {
            defaultLibFileName: (options) =>
              info.languageServiceHost.getDefaultLibFileName(options),
          },
        ),
        info,
        versions: new Map(),
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
      for (const key of ['getSemanticDiagnostics', 'getSyntacticDiagnostics'] as const)
        use(key, (file) =>
          service[key](virtualFilename(file)).map((value) => diagnostic(context, value)),
        );
      const dispose = proxy.dispose;
      proxy.dispose = () => {
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
          if (isTwillFile(file)) context.project.update(file, overlays[file]);
        for (const [file, text] of Object.entries(overlays))
          if (file.startsWith(sourceFilename(context.project.root) + '/'))
            context.project.update(file, text);
        context.versions.clear();
      }
    },
  };
}
