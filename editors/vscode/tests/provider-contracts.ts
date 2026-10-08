import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';

type Providers = Record<string, any>;

/** Record the shipped providers while still registering each one with VS Code. */
async function captureProviders(extension: vscode.Extension<unknown>) {
  const providers: Providers = {};
  const commands: Record<string, (...args: any[]) => any> = {};
  const subscriptions: vscode.Disposable[] = [];
  const bundle = join(extension.extensionPath, 'dist/extension.cjs');
  const require = createRequire(bundle);
  const module = require(bundle) as { activate(context: vscode.ExtensionContext): void };
  const hostAPI = require('vscode') as typeof vscode;
  const commandAPI = hostAPI.commands as unknown as {
    registerCommand(name: string, handler: (...args: any[]) => any): vscode.Disposable;
  };
  const originalCommand = commandAPI.registerCommand;
  const api = hostAPI.languages as unknown as Record<string, (...args: any[]) => any>;
  const originals = new Map<string, (...args: any[]) => any>();
  for (const name of [
    'registerDocumentFormattingEditProvider',
    'registerCompletionItemProvider',
    'registerHoverProvider',
    'registerRenameProvider',
    'registerCodeActionsProvider',
    'registerReferenceProvider',
    'registerDefinitionProvider',
    'registerSignatureHelpProvider',
  ]) {
    const original = api[name]!;
    originals.set(name, original);
    api[name] = (...args) => {
      if (Array.isArray(args[0]) && args[0].some((entry) => entry.language === 'twill-typescript'))
        providers[name] = args[1];
      return original(...args);
    };
  }
  try {
    // Obtain Twill's own API through the shipped module's require context.
    // Activate its cached, unmodified module with isolated subscriptions and
    // capture commands instead of registering conflicting global command IDs.
    commandAPI.registerCommand = (name, handler) => {
      commands[name] = handler;
      return new vscode.Disposable(() => {});
    };
    module.activate({
      extensionPath: extension.extensionPath,
      extension,
      subscriptions,
    } as vscode.ExtensionContext);
  } finally {
    for (const [name, original] of originals) api[name] = original;
    commandAPI.registerCommand = originalCommand;
  }
  assert.equal(Object.keys(providers).length, originals.size);
  return {
    providers,
    commands,
    dispose: () => subscriptions.reverse().forEach((item) => item.dispose()),
  };
}

export async function checkProviderContracts(extension: vscode.Extension<unknown>, root: string) {
  const { providers, commands, dispose } = await captureProviders(extension);
  const live = new vscode.CancellationTokenSource();
  const cancelled = new vscode.CancellationTokenSource();
  cancelled.cancel();
  const file = join(root, 'contracts.twill');
  writeFileSync(
    file,
    'export const users = [{ name: "Ada" }];\nexport const names = users.map { .name };\n',
  );
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
  await vscode.window.showTextDocument(document);
  const at = document.positionAt(document.getText().lastIndexOf('users') + 1);
  const start = new vscode.Position(0, 0);
  const range = new vscode.Range(start, start);
  const completion = providers.registerCompletionItemProvider as vscode.CompletionItemProvider;
  const formatter =
    providers.registerDocumentFormattingEditProvider as vscode.DocumentFormattingEditProvider;
  const actions = providers.registerCodeActionsProvider as vscode.CodeActionProvider;
  const references = providers.registerReferenceProvider as vscode.ReferenceProvider;
  const definitions = providers.registerDefinitionProvider as vscode.DefinitionProvider;
  const hover = providers.registerHoverProvider as vscode.HoverProvider;
  const signatures = providers.registerSignatureHelpProvider as vscode.SignatureHelpProvider;
  const rename = providers.registerRenameProvider as vscode.RenameProvider;
  try {
    // Exercise shipped providers against the host's document and actual edits.
    // Count source reads without replacing text, positions or version behavior.
    let reads = 0;
    // The host freezes method properties. An inherited facade keeps proxy
    // invariants intact while delegating every operation to that real document.
    const observed = new Proxy(Object.create(document) as vscode.TextDocument, {
      get(_target, key) {
        return key === 'getText'
          ? (...args: Parameters<vscode.TextDocument['getText']>) => {
              reads++;
              return document.getText(...args);
            }
          : Reflect.get(document, key);
      },
    });
    for (let index = 0; index < 5; index++)
      assert.ok(await hover.provideHover(observed, at, live.token));
    assert.equal(reads, 1, 'unchanged provider requests reuse the document version');
    const originalText = document.getText();
    const changed = new vscode.WorkspaceEdit();
    changed.insert(document.uri, new vscode.Position(0, 0), '// actual unsaved change\n');
    assert.equal(await vscode.workspace.applyEdit(changed), true);
    await hover.provideHover(
      observed,
      document.positionAt(document.getText().lastIndexOf('users') + 1),
      live.token,
    );
    assert.equal(reads, 2, 'a changed version refreshes the source immediately');
    const restore = new vscode.WorkspaceEdit();
    restore.replace(
      document.uri,
      new vscode.Range(new vscode.Position(0, 0), document.positionAt(document.getText().length)),
      originalText,
    );
    assert.equal(await vscode.workspace.applyEdit(restore), true);
    assert.deepEqual(
      await formatter.provideDocumentFormattingEdits(
        document,
        { tabSize: 4, insertSpaces: false },
        cancelled.token,
      ),
      [],
    );
    // Model an edit arriving while asynchronous formatting is pending. Other
    // document operations are delegated to the real TextDocument; only its
    // two observed versions are controlled, avoiding a timing-dependent race.
    let versions = 0;
    const edited = new Proxy(document, {
      get(target, key) {
        return key === 'version'
          ? target.version + Number(versions++ > 0)
          : Reflect.get(target, key);
      },
    });
    assert.deepEqual(
      await formatter.provideDocumentFormattingEdits(
        edited,
        { tabSize: 2, insertSpaces: true },
        live.token,
      ),
      [],
    );
    const untracked = new vscode.CompletionItem('untracked');
    assert.equal(await completion.resolveCompletionItem!(untracked, live.token), untracked);
    const requestAt = document.positionAt(document.getText().indexOf('.name') + 3);
    const result = await completion.provideCompletionItems(document, requestAt, live.token, {
      triggerCharacter: undefined,
      triggerKind: vscode.CompletionTriggerKind.Invoke,
    });
    const items = Array.isArray(result) ? result : result?.items;
    const selected = items?.find((item) => item.label === 'name');
    assert(selected, 'Real TS member completion must be available');
    assert.equal(await completion.resolveCompletionItem!(selected, cancelled.token), selected);
    const before = selected.detail;
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, document.positionAt(document.getText().length), '// newer version\n');
    assert(await vscode.workspace.applyEdit(edit));
    assert.equal(await completion.resolveCompletionItem!(selected, live.token), selected);
    assert.equal(selected.detail, before, 'Stale completion details must remain untouched');
    assert.equal(
      await signatures.provideSignatureHelp(document, start, live.token, {
        triggerCharacter: undefined,
        activeSignatureHelp: undefined,
        triggerKind: vscode.SignatureHelpTriggerKind.Invoke,
        isRetrigger: false,
      }),
      undefined,
    );
    assert.equal(await hover.provideHover(document, start, live.token), undefined);
    assert.equal(
      (
        (await definitions.provideDefinition(document, start, live.token)) as
          vscode.Location[] | undefined
      )?.length ?? 0,
      0,
    );
    assert.deepEqual(
      await references.provideReferences(
        document,
        at,
        { includeDeclaration: true },
        cancelled.token,
      ),
      [],
    );
    const all = await references.provideReferences(
      document,
      at,
      { includeDeclaration: true },
      live.token,
    );
    const uses = await references.provideReferences(
      document,
      at,
      { includeDeclaration: false },
      live.token,
    );
    assert(
      all && uses && all.length > uses.length,
      'Declaration filtering must remove the definition',
    );
    const context: vscode.CodeActionContext = {
      diagnostics: [],
      only: vscode.CodeActionKind.QuickFix,
      triggerKind: vscode.CodeActionTriggerKind.Invoke,
    };
    assert.deepEqual(
      await actions.provideCodeActions(document, range, context, cancelled.token),
      [],
    );
    for (const code of [
      undefined,
      'not-a-code',
      { value: 90001, target: vscode.Uri.parse('https://example.test/diagnostic') },
    ]) {
      const diagnostic = new vscode.Diagnostic(range, 'No safe source fix');
      diagnostic.code = code;
      assert.deepEqual(
        await actions.provideCodeActions(
          document,
          range,
          { ...context, diagnostics: [diagnostic] },
          live.token,
        ),
        [],
      );
    }
    await assert.rejects(
      async () => rename.prepareRename!(document, start, live.token),
      /cannot.*rename/i,
    );

    const propsFile = join(root, 'quoted-props.twillx');
    writeFileSync(
      propsFile,
      'declare function Card(props: { "data-id"?: string; children?: unknown }): any;\nexport const view = Card({ dat }) { "child" };\n',
    );
    const props = await vscode.workspace.openTextDocument(vscode.Uri.file(propsFile));
    const propResult = await completion.provideCompletionItems(
      props,
      props.positionAt(props.getText().indexOf('dat }') + 3),
      live.token,
      { triggerCharacter: undefined, triggerKind: vscode.CompletionTriggerKind.Invoke },
    );
    const propItems = Array.isArray(propResult) ? propResult : propResult?.items;
    const quoted = propItems?.find((item) => item.label === 'data-id');
    assert(quoted?.insertText instanceof vscode.SnippetString);
    assert(
      quoted.insertText.value.startsWith('"data-id": '),
      'Object completion must quote non-identifier keys',
    );

    const invalidRoot = join(root, '../invalid-config');
    mkdirSync(invalidRoot, { recursive: true });
    writeFileSync(
      join(invalidRoot, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          types: [],
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
        },
        include: ['*.twill'],
      }),
    );
    writeFileSync(join(invalidRoot, 'twill.config.json'), '{"implicitReturn":"invalid"}');
    const invalidFile = join(invalidRoot, 'main.twill');
    writeFileSync(invalidFile, 'export const value = 1;');
    const invalid = await vscode.workspace.openTextDocument(vscode.Uri.file(invalidFile));
    await vscode.window.showTextDocument(invalid);
    assert.equal(
      await completion.provideCompletionItems(invalid, start, live.token, {
        triggerCharacter: undefined,
        triggerKind: vscode.CompletionTriggerKind.Invoke,
      }),
      undefined,
    );
    assert.equal(await definitions.provideDefinition(invalid, start, live.token), undefined);
    assert.deepEqual(
      await references.provideReferences(invalid, start, { includeDeclaration: false }, live.token),
      [],
    );
    assert.deepEqual(await actions.provideCodeActions(invalid, range, context, live.token), []);
    await assert.rejects(
      async () => rename.prepareRename!(invalid, start, live.token),
      /cannot.*rename/i,
    );
    await assert.rejects(
      async () => rename.provideRenameEdits(invalid, start, 'renamed', live.token),
      /mapped safely/i,
    );
    await commands['twill.showGenerated']!();
    await commands['twill.projectInfo']!();
    rmSync(join(invalidRoot, 'twill.config.json'));

    // A language change closes/reopens the underlying model even when an
    // editor remains visible. Exercise disposal for native and dialect files.
    const native = await vscode.workspace.openTextDocument(vscode.Uri.file(join(root, 'scale.ts')));
    const nativePlain = await vscode.languages.setTextDocumentLanguage(native, 'plaintext');
    await vscode.languages.setTextDocumentLanguage(nativePlain, 'typescript');
    const plain = await vscode.languages.setTextDocumentLanguage(document, 'plaintext');
    const reopened = await vscode.languages.setTextDocumentLanguage(plain, 'twill-typescript');
    const restored = await references.provideReferences(
      reopened,
      reopened.positionAt(reopened.getText().lastIndexOf('users') + 1),
      { includeDeclaration: false },
      live.token,
    );
    assert(
      restored && restored.length > 0,
      'References must recover after closing/reopening the model',
    );
    const metadataFile = join(root, 'ignored-metadata.json');
    writeFileSync(metadataFile, '{"revision":1}');
    const metadata = await vscode.workspace.openTextDocument(vscode.Uri.file(metadataFile));
    await vscode.languages.setTextDocumentLanguage(metadata, 'plaintext');
    writeFileSync(metadataFile, '{"revision":2}');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(vscode.languages.getDiagnostics(vscode.Uri.file(metadataFile)).length, 0);

    const untitled = await vscode.workspace.openTextDocument({
      content: 'const value = 1;',
      language: 'typescript',
    });
    await vscode.window.showTextDocument(untitled);
    for (const command of ['twill.showGenerated', 'twill.projectInfo', 'twill.debugFile'])
      await commands[command]!();
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    assert.equal(vscode.window.activeTextEditor, undefined);
    for (const command of ['twill.showGenerated', 'twill.projectInfo', 'twill.debugFile'])
      await commands[command]!();
    console.log(
      'PASS: shipped provider cancellation, stale results, quoted props, filtering, config errors and inactive commands',
    );
  } finally {
    live.dispose();
    cancelled.dispose();
    dispose();
  }
}
