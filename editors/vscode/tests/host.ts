import * as vscode from 'vscode';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Registry, INITIAL } from 'vscode-textmate';
import { loadWASM, OnigScanner, OnigString } from 'vscode-oniguruma';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function eventually<T>(action: () => PromiseLike<T>, accept: (value: T) => boolean) {
  const deadline = Date.now() + 15000;
  let last: T | undefined;
  let error: unknown;
  do {
    try {
      last = await action();
      if (accept(last)) return last;
    } catch (value) {
      error = value;
    }
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error('Editor request did not become ready: ' + (error ?? JSON.stringify(last)));
}

export async function run() {
  const root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
  const extension = vscode.extensions.getExtension('swiftuijs.twill')!;
  assert(extension, 'The extracted VSIX must be installed');
  await extension.activate();
  const require = createRequire(join(root, '../tests.cjs'));
  const wasm = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength));
  const grammars = ['twill', 'twillx'].map((name) =>
    JSON.parse(
      readFileSync(join(extension.extensionPath, 'syntaxes', name + '.tmLanguage.json'), 'utf8'),
    ),
  );
  const nativeGrammars = ['TypeScript', 'TypeScriptReact'].map((name) =>
    JSON.parse(
      readFileSync(
        join(
          dirname(process.execPath),
          'resources/app/extensions/typescript-basics/syntaxes',
          name + '.tmLanguage.json',
        ),
        'utf8',
      ),
    ),
  );
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns) => new OnigScanner(patterns),
      createOnigString: (text) => new OnigString(text),
    }),
    loadGrammar: async (scope) =>
      [...grammars, ...nativeGrammars].find((grammar) => grammar.scopeName === scope) ?? null,
  });
  try {
    for (const grammar of grammars) {
      const loaded = (await registry.loadGrammar(grammar.scopeName))!;
      let state = INITIAL;
      const controls: string[] = [];
      for (const line of [
        'function describe(input: Result) {',
        'guard const { result } = input else { return "missing"; }',
        'return switch (result) {',
        'case { kind: "ok", value }: value.toFixed();',
        'default: "unknown";',
        '};',
        'const words = "guard else switch case default";',
        'object.switch();',
        '}',
      ]) {
        const tokens = loaded.tokenizeLine(line, state);
        state = tokens.ruleStack;
        for (const token of tokens.tokens)
          if (token.scopes.some((scope) => scope.startsWith('keyword.control')))
            controls.push(line.slice(token.startIndex, token.endIndex));
      }
      for (const word of ['guard', 'else', 'switch', 'case', 'default'])
        assert.equal(
          controls.filter((control) => control === word).length,
          1,
          `${grammar.name}: ${word} must highlight once, excluding strings/properties`,
        );
    }
  } finally {
    registry.dispose();
  }
  console.log(
    'PASS: shipped TS/TSX grammars highlight guard and switch expressions with actual built-in TS grammars',
  );
  const open = async (name: string) => {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(join(root, name)));
    await vscode.window.showTextDocument(doc);
    return doc;
  };
  const position = (doc: vscode.TextDocument, needle: string, delta = 0) => {
    const offset = doc.getText().indexOf(needle);
    assert(offset >= 0, 'Missing source needle: ' + needle);
    return doc.positionAt(offset + delta);
  };
  const completions = (doc: vscode.TextDocument, at: vscode.Position, resolve = 0) =>
    vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      at,
      undefined,
      resolve,
    );
  const label = (item: vscode.CompletionItem) =>
    typeof item.label === 'string' ? item.label : item.label.label;

  const formatting = await open('api.twill');
  const formatEdits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
    'vscode.executeFormatDocumentProvider',
    formatting.uri,
    { tabSize: 2, insertSpaces: true },
  );
  assert(formatEdits?.length, 'The packaged formatter must return edits');
  const formatted = new vscode.WorkspaceEdit();
  formatted.set(formatting.uri, formatEdits!);
  assert(await vscode.workspace.applyEdit(formatted));
  assert(formatting.getText().includes('map { item in'));
  assert(formatting.getText().includes('value: number'));
  console.log('PASS: packaged formatter preserves Twill syntax and TypeScript annotations');

  const branching = await open('branching.twill');
  const branchMembers = await eventually(
    () => completions(branching, position(branching, 'amount.toFixed', 7)),
    (list) => !!list?.items.some((item) => label(item) === 'toFixed'),
  );
  assert(branchMembers!.items.some((item) => label(item) === 'toPrecision'));
  const branchRename = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
    'vscode.executeDocumentRenameProvider',
    branching.uri,
    position(branching, 'amount}', 1),
    'total',
  );
  assert(branchRename && (await vscode.workspace.applyEdit(branchRename)));
  assert(branching.getText().includes('value: total}'));
  assert(branching.getText().includes('total.toFixed()'));
  const branchFormats = await vscode.commands.executeCommand<vscode.TextEdit[]>(
    'vscode.executeFormatDocumentProvider',
    branching.uri,
    { tabSize: 2, insertSpaces: true },
  );
  assert(branchFormats?.length);
  const branchFormatEdit = new vscode.WorkspaceEdit();
  branchFormatEdit.set(branching.uri, branchFormats!);
  assert(await vscode.workspace.applyEdit(branchFormatEdit));
  assert(branching.getText().includes('guard const { result: item }'));
  assert(branching.getText().includes('return switch (item)'));
  await eventually(
    async () => vscode.languages.getDiagnostics(branching.uri),
    (items) => items.length === 0,
  );
  const omit = new vscode.WorkspaceEdit();
  omit.replace(
    branching.uri,
    new vscode.Range(new vscode.Position(0, 0), branching.positionAt(branching.getText().length)),
    branching.getText().replace(/\s*case \{ kind: "bad", error \}: error;/, ''),
  );
  assert(await vscode.workspace.applyEdit(omit));
  await eventually(
    async () => vscode.languages.getDiagnostics(branching.uri),
    (items) => items.some((item) => item.code === 1360),
  );
  console.log(
    'PASS: destructured guard and pattern switch completion, rename, formatting and exhaustive diagnostics',
  );

  const view = await open('view.twillx');
  const props = await eventually(
    () => completions(view, position(view, 'tit }', 3)),
    (list) => !!list?.items.some((item) => label(item) === 'title'),
  );
  const title = props!.items.find((item) => label(item) === 'title')!;
  assert(title.insertText instanceof vscode.SnippetString);
  assert.match(title.insertText.value, /^title: /);
  assert.equal(view.getText(title.range as vscode.Range), 'tit');
  console.log('PASS: partial React props use original source ranges and value snippets');

  const patch = new vscode.WorkspaceEdit();
  patch.replace(
    view.uri,
    new vscode.Range(new vscode.Position(0, 0), view.positionAt(view.getText().length)),
    view.getText().replace('tit }', "title: 'Hi', onClick: event => event. }"),
  );
  assert(await vscode.workspace.applyEdit(patch));
  const members = await eventually(
    () => completions(view, position(view, 'event. }', 6)),
    (list) => !!list?.items.some((item) => label(item) === 'x'),
  );
  assert.equal(members!.items.find((item) => label(item) === 'x')!.insertText, 'x');
  const member = members!.items.find((item) => label(item) === 'x')!;
  const memberEdit = new vscode.WorkspaceEdit();
  const memberPosition = position(view, 'event. }', 6);
  const memberRange =
    member.range instanceof vscode.Range
      ? member.range
      : (member.range?.replacing ??
        view.getWordRangeAtPosition(memberPosition) ??
        new vscode.Range(memberPosition, memberPosition));
  memberEdit.replace(view.uri, memberRange, member.insertText as string);
  assert(await vscode.workspace.applyEdit(memberEdit));
  assert(view.getText().includes("event.x }) { 'Hello' }"));
  console.log('PASS: unsaved incomplete React callbacks retain contextual member completion');

  const auto = await open('auto.twill');
  const imported = await eventually(
    () => completions(auto, position(auto, 'twice', 3), 2000),
    (list) =>
      !!list?.items.some((item) => label(item) === 'twice' && item.additionalTextEdits?.length),
  );
  const twice = imported!.items.find(
    (item) => label(item) === 'twice' && item.additionalTextEdits?.length,
  )!;
  const importEdit = new vscode.WorkspaceEdit();
  importEdit.set(auto.uri, twice.additionalTextEdits!);
  assert(await vscode.workspace.applyEdit(importEdit));
  assert.match(auto.getText(), /import.*twice.*api/);
  assert(!auto.getText().includes('.twill.ts'));
  await eventually(
    async () => vscode.languages.getDiagnostics(auto.uri),
    (items) => !items.some((item) => item.code === 2304),
  );
  console.log('PASS: selecting auto-import completion applies source imports');

  const imports = await open('imports.twill');
  const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    'vscode.executeCodeActionProvider',
    imports.uri,
    new vscode.Range(new vscode.Position(0, 0), imports.positionAt(imports.getText().length)),
    'source.organizeImports',
  );
  const organize = actions!.find((action) => action.edit);
  assert(organize?.edit);
  assert(await vscode.workspace.applyEdit(organize.edit));
  assert(!imports.getText().includes('unused'));
  assert(imports.getText().includes('[1].map { n in twice(n) }'));
  console.log('PASS: organize imports preserves trailing syntax');

  const fix = await open('fix.twill');
  const problems = await eventually(
    async () => vscode.languages.getDiagnostics(fix.uri),
    (items) => items.some((item) => item.code === 2551),
  );
  const diagnostic = problems.find((item) => item.code === 2551)!;
  const fixes = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    'vscode.executeCodeActionProvider',
    fix.uri,
    diagnostic.range,
    'quickfix',
  );
  const spelling = fixes!.find((action) => action.title.includes('toFixed'));
  assert(spelling?.edit);
  assert(await vscode.workspace.applyEdit(spelling.edit));
  assert(fix.getText().includes('.map { value in value.toFixed(2) }'));
  console.log('PASS: mapped diagnostics and spelling code fixes edit original callbacks');

  const api = await open('api.twill');
  const scaleUri = vscode.Uri.file(join(root, 'scale.ts'));
  const originalScale = await vscode.workspace.fs.readFile(scaleUri);
  try {
    await vscode.workspace.fs.writeFile(
      scaleUri,
      Buffer.from('export function scale(value: number): string { return String(value); }\n'),
    );
    await eventually(
      async () => vscode.languages.getDiagnostics(api.uri),
      (items) => items.some((item) => item.code === 2322),
    );
    assert(view.getText().includes('event.x'));
    assert(auto.getText().includes('import'));
  } finally {
    await vscode.workspace.fs.writeFile(scaleUri, originalScale);
  }
  await eventually(
    async () => vscode.languages.getDiagnostics(api.uri),
    (items) => !items.some((item) => item.code === 2322),
  );
  console.log('PASS: dependency disk changes refresh diagnostics without losing unsaved buffers');

  const references = await eventually(
    () =>
      vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        api.uri,
        position(api, 'twice', 1),
      ),
    (entries) => !!entries?.some((entry) => entry.uri.fsPath.endsWith('consumer.ts')),
  );
  assert(references!.some((entry) => entry.uri.fsPath.endsWith('auto.twill')));
  for (const entry of references!) {
    const document = await vscode.workspace.openTextDocument(entry.uri);
    assert.equal(
      document.getText(entry.range),
      'twice',
      JSON.stringify({ file: entry.uri.fsPath, range: entry.range, source: document.getText() }),
    );
    assert(!/\.twill\.ts$/.test(entry.uri.fsPath));
  }
  const nativeConsumer = await open('consumer.ts');
  const nativeReferences = await eventually(
    () =>
      vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        nativeConsumer.uri,
        position(nativeConsumer, 'twice', 1),
      ),
    (entries) => !!entries?.some((entry) => entry.uri.fsPath.endsWith('api.twill')),
  );
  for (const entry of nativeReferences!) {
    const document = await vscode.workspace.openTextDocument(entry.uri);
    assert.equal(
      document.getText(entry.range),
      'twice',
      JSON.stringify({ file: entry.uri.fsPath, range: entry.range, source: document.getText() }),
    );
  }
  console.log('PASS: references from Twill and native TS map to unsaved original source');

  const renamed = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
    'vscode.executeDocumentRenameProvider',
    api.uri,
    position(api, 'twice', 1),
    'double',
  );
  assert(renamed && renamed.entries().some(([uri]) => uri.fsPath.endsWith('consumer.ts')));
  assert(await vscode.workspace.applyEdit(renamed));
  const consumer = await open('consumer.ts');
  assert(consumer.getText().includes('double(21)'));
  const scale = await open('scale.ts');
  const nativeRename = await eventually(
    () =>
      vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        'vscode.executeDocumentRenameProvider',
        scale.uri,
        position(scale, 'scale', 2),
        'timesTwo',
      ),
    (edits) => !!edits?.entries().some(([uri]) => uri.fsPath.endsWith('api.twill')),
  );
  assert(await vscode.workspace.applyEdit(nativeRename!));
  assert(
    api.getText().includes('timesTwo(item)'),
    JSON.stringify({
      source: api.getText(),
      edits: nativeRename!.entries().map(([uri, edits]) => ({ uri: uri.fsPath, edits })),
    }),
  );
  console.log('PASS: cross-file rename works from Twill and native TS with unsaved overlays');

  const settings = await open('settings-consumer.ts');
  const settingsUri = vscode.Uri.file(join(root, 'twill.config.json'));
  const hoverType = async () => {
    const items = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      settings.uri,
      position(settings, 'values;', 2),
    );
    return (
      items
        ?.flatMap((item) => item.contents)
        .map((item) => (typeof item === 'string' ? item : item.value))
        .join('\n') ?? ''
    );
  };
  await eventually(hoverType, (text) => text.includes('number[]'));
  try {
    await vscode.workspace.fs.writeFile(settingsUri, Buffer.from('{"implicitReturn":false}'));
    await eventually(hoverType, (text) => text.includes('void[]'));
    await eventually(
      async () => vscode.languages.getDiagnostics(settings.uri),
      (items) => items.some((item) => item.code === 2322),
    );
    assert(
      api.getText().includes('timesTwo(item)'),
      'Configuration reload must retain unsaved source',
    );
  } finally {
    await vscode.workspace.fs.delete(settingsUri);
  }
  await eventually(hoverType, (text) => text.includes('number[]'));
  await eventually(
    async () => vscode.languages.getDiagnostics(settings.uri),
    (items) => !items.some((item) => item.code === 2322),
  );
  console.log(
    'PASS: configuration saves refresh native TS hover and diagnostics with unsaved overlays',
  );

  await vscode.window.showTextDocument(api);
  const originalSource = api.getText();
  await vscode.commands.executeCommand('twill.showGenerated');
  assert.equal(vscode.window.activeTextEditor?.document.languageId, 'typescript');
  const generated = vscode.window.activeTextEditor!.document.getText();
  assert(generated.includes('=>'));
  assert.match(generated, /=>\s*\{\n\s+return/);
  assert.equal(api.getText(), originalSource, 'Generated display must not edit source');
  const invalidView = new vscode.WorkspaceEdit();
  invalidView.replace(
    view.uri,
    new vscode.Range(position(view, "'Hi'"), position(view, "'Hi'", 4)),
    '123',
  );
  assert(await vscode.workspace.applyEdit(invalidView));
  await vscode.window.showTextDocument(api);
  await vscode.commands.executeCommand('twill.projectInfo');
  const report = JSON.parse(vscode.window.activeTextEditor!.document.getText());
  assert.equal(report.twillVersion, extension.packageJSON.version);
  assert(report.files.twill > 0);
  assert.equal(report.ok, false);
  assert(
    report.diagnostics.some((item: { filename?: string }) =>
      item.filename?.endsWith('view.twillx'),
    ),
    'Project report must include diagnostics from other unsaved files',
  );
  const validView = new vscode.WorkspaceEdit();
  validView.replace(
    view.uri,
    new vscode.Range(position(view, '123'), position(view, '123', 3)),
    "'Hi'",
  );
  assert(await vscode.workspace.applyEdit(validView));
  console.log('PASS: generated-source viewer and project diagnostic report');

  const debug = await open('debug.twill');
  const breakpoint = new vscode.SourceBreakpoint(
    new vscode.Location(debug.uri, position(debug, 'console.log')),
  );
  vscode.debug.addBreakpoints([breakpoint]);
  const stopped: { session: vscode.DebugSession; thread: number }[] = [];
  const trackers = ['node', 'pwa-node'].map((type) =>
    vscode.debug.registerDebugAdapterTrackerFactory(type, {
      createDebugAdapterTracker(session) {
        return {
          onDidSendMessage(message) {
            if (message.event === 'stopped')
              stopped.push({ session, thread: message.body.threadId });
          },
        };
      },
    }),
  );
  let session: vscode.DebugSession | undefined;
  try {
    await vscode.commands.executeCommand('twill.debugFile');
    const first = await eventually(
      async () => stopped.shift(),
      (event) => !!event,
    );
    session = first!.session;
    const trace = await session.customRequest('stackTrace', { threadId: first!.thread });
    assert.equal(
      trace.stackFrames[0].source.path.replaceAll('\\', '/'),
      debug.uri.fsPath.replaceAll('\\', '/'),
    );
    assert.equal(trace.stackFrames[0].line, 4, 'Debugger statement must map to original Twill');
    await session.customRequest('continue', { threadId: first!.thread });
    const second = await eventually(
      async () => stopped.shift(),
      (event) => !!event,
    );
    const atBreakpoint = await session.customRequest('stackTrace', { threadId: second!.thread });
    assert.equal(
      atBreakpoint.stackFrames[0].source.path.replaceAll('\\', '/'),
      debug.uri.fsPath.replaceAll('\\', '/'),
    );
    assert.equal(
      atBreakpoint.stackFrames[0].line,
      5,
      'Source breakpoint must map to original Twill',
    );
    console.log('PASS: Node debugging stops at original Twill lines and source breakpoints');
  } finally {
    await vscode.debug.stopDebugging(session);
    vscode.debug.removeBreakpoints([breakpoint]);
    trackers.forEach((tracker) => tracker.dispose());
  }
  console.log('Twill packaged VSIX extension-host integration checks passed.');
}
