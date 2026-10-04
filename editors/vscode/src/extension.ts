import * as vscode from 'vscode';
import ts from 'typescript';
import { dirname, join } from 'node:path';
import { TwillProject, virtualFilename, sourceFilename } from '../../../src/project';
import { isTwillFile } from '../../../src/compiler';

const languages = ['twill-typescript', 'twill-tsx'];
const selector = languages.map((language) => ({ language, scheme: 'file' }));

export function activate(context: vscode.ExtensionContext) {
  // The bundled TS-server plugin bridges native TS/JS documents. Custom
  // Twill documents use the providers below; share their unsaved sources.
  const nativeExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
  const bridge =
    nativeExtension &&
    Promise.resolve(nativeExtension.activate())
      .then(
        (extension) =>
          extension.getAPI(0) as { configurePlugin(name: string, config: unknown): void },
      )
      .catch((error) => {
        output.appendLine(String(error));
        return undefined;
      });
  const syncBridge = () => {
    const overlays = Object.fromEntries(
      vscode.workspace.textDocuments
        .filter((document) => document.uri.scheme === 'file' && isTwillFile(document.fileName))
        .map((document) => [sourceFilename(document.fileName), document.getText()]),
    );
    void bridge?.then((api) => api?.configurePlugin('@swiftuijs/twill', { overlays }));
  };
  const projects = new Map<string, TwillProject>();
  const diagnostics = vscode.languages.createDiagnosticCollection('twill');
  const output = vscode.window.createOutputChannel('Twill');
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const completionDetails = new WeakMap<
    vscode.CompletionItem,
    {
      document: vscode.TextDocument;
      version: number;
      project: TwillProject;
      offset: number;
      entry: ts.CompletionEntry;
    }
  >();

  function getProject(document: vscode.TextDocument) {
    const config = ts.findConfigFile(dirname(document.fileName), ts.sys.fileExists);
    const root = sourceFilename(
      config
        ? dirname(config)
        : (vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ??
            dirname(document.fileName)),
    );
    let project = projects.get(root);
    if (!project) {
      project = new TwillProject(
        config ?? join(root, 'tsconfig.json'),
        {},
        {
          inferred: true,
          recover: true,
          defaultLibFileName: (options) =>
            join(context.extensionPath, 'dist/typescript-lib', ts.getDefaultLibFileName(options)),
        },
      );
      projects.set(root, project);
      for (const open of vscode.workspace.textDocuments) {
        if (
          open.uri.scheme === 'file' &&
          /\.(?:twillx?|[cm]?tsx?|[cm]?jsx?)$/.test(open.fileName) &&
          sourceFilename(open.fileName).startsWith(root + '/')
        )
          project.update(open.fileName, open.getText());
      }
    }
    project.update(document.fileName, document.getText());
    return project;
  }

  const safely = <T>(
    document: vscode.TextDocument,
    operation: (project: TwillProject) => T,
  ): T | undefined => {
    try {
      return operation(getProject(document));
    } catch (error) {
      output.appendLine(String(error));
      return undefined;
    }
  };

  function refresh(document: vscode.TextDocument) {
    if (document.uri.scheme !== 'file' || !isTwillFile(document.fileName)) return;
    const items = safely(document, (project) => project.diagnostics(document.fileName));
    if (!items) return;
    diagnostics.set(
      document.uri,
      items
        .filter((item) => !item.filename || item.filename === sourceFilename(document.fileName))
        .map((item) => {
          const start = new vscode.Position(item.line - 1, item.column);
          const end = document.positionAt(document.offsetAt(start) + item.length);
          const diagnostic = new vscode.Diagnostic(
            new vscode.Range(start, end),
            item.message,
            item.category === 'error'
              ? vscode.DiagnosticSeverity.Error
              : vscode.DiagnosticSeverity.Warning,
          );
          diagnostic.code = item.code;
          diagnostic.source = 'twill';
          return diagnostic;
        }),
    );
  }

  function schedule(document: vscode.TextDocument) {
    if (document.uri.scheme !== 'file' || !isTwillFile(document.fileName)) return;
    const key = document.uri.toString();
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        syncBridge();
        refresh(document);
      }, 150),
    );
  }

  context.subscriptions.push(
    diagnostics,
    output,
    vscode.workspace.onDidOpenTextDocument(schedule),
    vscode.workspace.onDidChangeTextDocument((event) => {
      for (const project of projects.values())
        if (
          event.document.uri.scheme === 'file' &&
          /\.(?:twillx?|[cm]?tsx?|[cm]?jsx?)$/.test(event.document.fileName) &&
          sourceFilename(event.document.fileName).startsWith(project.root + '/')
        )
          project.update(event.document.fileName, event.document.getText());
      vscode.workspace.textDocuments.forEach(schedule);
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (isTwillFile(document.fileName)) syncBridge();
      clearTimeout(timers.get(document.uri.toString()));
      timers.delete(document.uri.toString());
      diagnostics.delete(document.uri);
      if (/\.(?:twillx?|[cm]?tsx?|[cm]?jsx?)$/.test(document.fileName))
        projects.forEach((project) => {
          if (sourceFilename(document.fileName).startsWith(project.root + '/'))
            project.update(document.fileName);
        });
    }),
    {
      dispose() {
        timers.forEach(clearTimeout);
        projects.forEach((project) => project.dispose());
      },
    },
  );

  const watcher = vscode.workspace.createFileSystemWatcher(
    '**/*.{twill,twillx,ts,tsx,js,jsx,json}',
  );
  const reset = () => {
    projects.forEach((project) => project.dispose());
    projects.clear();
    vscode.workspace.textDocuments.forEach(schedule);
  };
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(reset),
    watcher.onDidCreate(reset),
    watcher.onDidDelete(reset),
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, {
      provideHover(document, position) {
        return safely(document, (project) => {
          const info = project.service.getQuickInfoAtPosition(
            virtualFilename(document.fileName),
            project.toGeneratedOffset(document.fileName, document.offsetAt(position)),
          );
          if (!info) return;
          const contents = new vscode.MarkdownString();
          contents.appendCodeblock(ts.displayPartsToString(info.displayParts), 'typescript');
          contents.appendText('\n' + ts.displayPartsToString(info.documentation));
          const start = project.toOriginalOffset(document.fileName, info.textSpan.start);
          const end = project.toOriginalOffset(
            document.fileName,
            info.textSpan.start + info.textSpan.length,
          );
          return new vscode.Hover(
            contents,
            new vscode.Range(document.positionAt(start), document.positionAt(Math.max(start, end))),
          );
        });
      },
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      {
        provideCompletionItems(document, position) {
          return safely(document, (project) => {
            const offset = project.toGeneratedOffset(
              document.fileName,
              document.offsetAt(position),
            );
            const completions = project.service.getCompletionsAtPosition(
              virtualFilename(document.fileName),
              offset,
              { includeCompletionsForModuleExports: false, includeCompletionsWithInsertText: true },
            );
            return completions?.entries.map((entry) => {
              const item = new vscode.CompletionItem(
                entry.name,
                entry.kind === 'method' || entry.kind === 'function'
                  ? vscode.CompletionItemKind.Function
                  : entry.kind === 'property'
                    ? vscode.CompletionItemKind.Property
                    : vscode.CompletionItemKind.Variable,
              );
              item.sortText = entry.sortText;
              item.insertText = entry.insertText ?? entry.name;
              // Resolve documentation only for the selected item, rather
              // than asking TS to describe every entry on each keystroke.
              completionDetails.set(item, {
                document,
                version: document.version,
                project,
                offset,
                entry,
              });
              if (entry.replacementSpan) {
                const start = project.toOriginalOffset(
                  document.fileName,
                  entry.replacementSpan.start,
                );
                const end = project.toOriginalOffset(
                  document.fileName,
                  entry.replacementSpan.start + entry.replacementSpan.length,
                );
                item.range = new vscode.Range(
                  document.positionAt(start),
                  document.positionAt(Math.max(start, end)),
                );
              }
              return item;
            });
          });
        },
        resolveCompletionItem(item, token) {
          const request = completionDetails.get(item);
          if (!request || token.isCancellationRequested) return item;
          const { document, version, project, offset, entry } = request;
          if (
            document.isClosed ||
            document.version !== version ||
            projects.get(project.root) !== project
          )
            return item;
          return (
            safely(document, () => {
              const details = project.service.getCompletionEntryDetails(
                virtualFilename(document.fileName),
                offset,
                entry.name,
                {},
                entry.source,
                {},
                entry.data,
              );
              if (details) {
                item.detail = ts.displayPartsToString(details.displayParts);
                item.documentation = new vscode.MarkdownString(
                  ts.displayPartsToString(details.documentation),
                );
              }
              return item;
            }) ?? item
          );
        },
      },
      '.',
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, {
      async provideDefinition(document, position) {
        const definitions = safely(document, (project) => {
          const entries = project.service.getDefinitionAtPosition(
            virtualFilename(document.fileName),
            project.toGeneratedOffset(document.fileName, document.offsetAt(position)),
          );
          return entries?.map((entry) => ({
            filename: sourceFilename(entry.fileName),
            start: project.toOriginalOffset(entry.fileName, entry.textSpan.start),
            end: project.toOriginalOffset(
              entry.fileName,
              entry.textSpan.start + entry.textSpan.length,
            ),
          }));
        });
        if (!definitions) return;
        return Promise.all(
          definitions.map(async (entry) => {
            const target = await vscode.workspace.openTextDocument(entry.filename);
            return new vscode.Location(
              target.uri,
              new vscode.Range(
                target.positionAt(entry.start),
                target.positionAt(Math.max(entry.start, entry.end)),
              ),
            );
          }),
        );
      },
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerSignatureHelpProvider(
      selector,
      {
        provideSignatureHelp(document, position) {
          return safely(document, (project) => {
            const info = project.service.getSignatureHelpItems(
              virtualFilename(document.fileName),
              project.toGeneratedOffset(document.fileName, document.offsetAt(position)),
              undefined,
            );
            if (!info) return;
            const help = new vscode.SignatureHelp();
            help.activeParameter = info.argumentIndex;
            help.activeSignature = info.selectedItemIndex;
            help.signatures = info.items.map((item) => {
              const signature = new vscode.SignatureInformation(
                ts.displayPartsToString(item.prefixDisplayParts) +
                  item.parameters
                    .map((parameter) => ts.displayPartsToString(parameter.displayParts))
                    .join(ts.displayPartsToString(item.separatorDisplayParts)) +
                  ts.displayPartsToString(item.suffixDisplayParts),
                ts.displayPartsToString(item.documentation),
              );
              signature.parameters = item.parameters.map(
                (parameter) =>
                  new vscode.ParameterInformation(
                    ts.displayPartsToString(parameter.displayParts),
                    ts.displayPartsToString(parameter.documentation),
                  ),
              );
              return signature;
            });
            return help;
          });
        },
      },
      '(',
      ',',
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('twill.showGenerated', async () => {
      const source = vscode.window.activeTextEditor?.document;
      if (!source || !isTwillFile(source.fileName)) return;
      const result = safely(source, (project) => project.transformed(source.fileName));
      if (result)
        await vscode.window.showTextDocument(
          await vscode.workspace.openTextDocument({ content: result.code, language: 'typescript' }),
          vscode.ViewColumn.Beside,
        );
    }),
  );
  vscode.workspace.textDocuments.forEach(schedule);
}
