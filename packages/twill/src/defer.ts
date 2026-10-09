import MagicString from 'magic-string';
import type { Language } from './compiler.js';
import { syncDeferBody } from './defer-helper.js';

type Node = { type: string; start: number; end: number; [key: string]: any };
type Comment = { start: number; end: number; value: string; type: string };
type Scope = { block: Node; functionBody: boolean; defers: Node[] };
const functions = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function children(node: Node, visit: (child: Node) => void) {
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'trailing') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child?.type) visit(child);
      }
    } else if (value?.type) visit(value);
  }
}

/** Native finally where scope permits; callbacks retain dynamic registration semantics. */
export function lowerDefers(
  source: string,
  ast: Node,
  code: MagicString,
  language: Language,
  usedNames: Set<string>,
  contentStarts: Map<Node, number>,
  comments: Comment[],
  runtime: 'inline' | 'external',
  sourceType: 'module' | 'script',
  fail: (node: Node, message: string) => never,
) {
  const scopes: Scope[] = [];
  const visit = (node: Node, scope: Scope | undefined, parent?: Node) => {
    if (functions.has(node.type) || ['Program', 'TSModuleBlock', 'SwitchCase'].includes(node.type))
      scope = undefined;
    if (node.type === 'BlockStatement' || node.type === 'StaticBlock') {
      scope = {
        block: node,
        functionBody: !!parent && functions.has(parent.type) && parent.body === node,
        defers: [],
      };
      scopes.push(scope);
    }
    if (node.type === 'DeferStatement') {
      if (!scope)
        fail(
          node,
          'defer requires an explicit block or function body; wrap a switch case in braces.',
        );
      scope.defers.push(node);
      const check = (item: Node) => {
        if (functions.has(item.type)) return;
        if (item.type === 'ReturnStatement')
          fail(
            item,
            'A defer cleanup cannot return; use a nested function for local early returns.',
          );
        children(item, check);
      };
      check(node.cleanup.body);
    }
    children(node, (child) => visit(child, scope, node));
  };
  visit(ast, undefined);
  let counter = 0;
  const fresh = (part: string) => {
    let name: string;
    do name = `__twill${part}${counter++}`;
    while (usedNames.has(name));
    usedNames.add(name);
    return name;
  };
  const sortedComments = [...comments].sort((a, b) => b.end - a.end);
  const leadingComment = (statement: Node, minimum: number) => {
    let start = statement.start;
    // Move adjacent JSDoc with hoisted function initializers, retaining checkJs
    // annotations. Comments emitted during TS backtracking may be duplicated.
    for (const comment of sortedComments) {
      if (comment.end > start || comment.start < minimum) continue;
      if (/\S/.test(source.slice(comment.end, start))) break;
      if (comment.type === 'Block' && comment.value.startsWith('*')) start = comment.start;
      else break;
    }
    return start;
  };
  let sharedHelper: string | undefined;
  for (const scope of scopes) {
    if (!scope.defers.length) continue;
    const { block } = scope;
    const statements = block.body as Node[];
    // A direct synchronous cleanup can be the original finally body. Moving
    // lexical declarations into a new try would change TDZ/closure visibility;
    // retain the callback lowering whenever that or hoisting is observable.
    const first = statements.indexOf(scope.defers[0]!);
    let native =
      first >= 0 && scope.defers.every((node) => !node.awaited && statements.includes(node));
    if (native) {
      native = !statements.some(
        (node, index) =>
          node.type === 'FunctionDeclaration' ||
          node.type === 'TSDeclareFunction' ||
          (node.type === 'VariableDeclaration' && node.kind.endsWith('using')) ||
          (index > first &&
            ((node.type === 'VariableDeclaration' && node.kind !== 'var') ||
              (node.type.endsWith('Declaration') && node.type !== 'VariableDeclaration') ||
              (node.type === 'GuardStatement' && node.binding))),
      );
      const check = (node: Node) => {
        if (
          node.type === 'WithStatement' ||
          node.type === 'ThisExpression' ||
          (node.type === 'VariableDeclarator' && !node.init) ||
          (node.type === 'VariableDeclaration' &&
            node.kind === 'var' &&
            (!statements.includes(node) || node.start > scope.defers[0]!.start)) ||
          (node.type === 'CallExpression' &&
            node.callee.type === 'Identifier' &&
            node.callee.name === 'eval')
        )
          native = false;
        children(node, check);
      };
      if (native) check(block);
      const cleanupScope = (node: Node) => {
        if (
          node.type === 'FunctionDeclaration' ||
          node.directive ||
          (node.type === 'VariableDeclaration' && node.kind === 'var')
        )
          native = false;
        if (!functions.has(node.type)) children(node, cleanupScope);
      };
      if (native) for (const node of scope.defers) cleanupScope(node.cleanup.body);
    }
    if (native) {
      for (const node of [...scope.defers].reverse()) {
        code.overwrite(node.start, node.cleanup.body.start, ';try {');
        if (!node.cleanup.body.body.length) {
          // Empty cleanup has no executable tokens to map. Keep its comments,
          // but mark the emitted empty finally as scaffolding for source lint.
          code.remove(node.cleanup.body.start, node.cleanup.body.end);
          code.appendLeft(
            block.end - 1,
            '\n} finally ' + source.slice(node.cleanup.body.start, node.cleanup.body.end) + '\n',
          );
          continue;
        }
        code.prependRight(node.cleanup.body.start, '\n} finally ');
        code.appendLeft(node.cleanup.body.end, '\n');
        if (node.cleanup.body.end !== block.end - 1)
          code.move(node.cleanup.body.start, node.cleanup.body.end, block.end - 1);
      }
      continue;
    }
    // A direct statement executes at most once per block entry. Nested or
    // unbraced-loop registrations still require the dynamic stack.
    const single = scope.defers.length === 1 && statements.includes(scope.defers[0]!);
    const stack = fresh(single ? 'Cleanup' : 'Defers');
    const failure = single ? '' : fresh('Failure');
    const failed = single ? '' : fresh('Failed');
    const callback = single ? stack : fresh('Cleanup');
    const error = single ? '' : fresh('Error');
    const anyAsync = scope.defers.some((node) => node.awaited);
    const allAsync = scope.defers.every((node) => node.awaited);
    const mixed = anyAsync && !allAsync;
    const callbackType = mixed ? '{ run: () => unknown; async: boolean }' : '() => unknown';
    const storageType = single
      ? '(() => unknown) | undefined'
      : `Array<${callbackType}> | undefined`;
    const annotation = language.startsWith('ts') ? `: ${storageType}` : '';
    const jsdoc = language.startsWith('js') ? `\n/** @type {${storageType}} */\n` : '';
    let start = contentStarts.get(block) ?? block.start + 1;
    // StaticBlock.start includes the `static` token, unlike BlockStatement.
    if (block.type === 'StaticBlock') start = statements[0]!.start;
    let index = 0;
    while (statements[index]?.directive) start = statements[index++]!.end;
    const ordinary = statements.slice(index);
    const declarations = scope.functionBody
      ? ordinary.filter((node) => node.type === 'FunctionDeclaration')
      : [];
    if (scope.functionBody && ordinary.some((node) => node.type === 'TSDeclareFunction'))
      fail(
        ordinary.find((node) => node.type === 'TSDeclareFunction')!,
        'Function overloads/ambient function declarations in a defer scope are not supported; move them to a separate scope.',
      );
    const names = [...new Set(declarations.map((node) => node.id.name as string))];
    code.prependLeft(
      start,
      `;${jsdoc}let ${stack}${annotation};${names.length ? `var ${names.join(',')};` : ''}try {\n`,
    );
    // Function-body declarations bind like var, including parameter aliases.
    // Initializers stay in the try's lexical environment so they still capture
    // let/const declared anywhere in the original body. Preserve the name token
    // and parameter/body tokens rather than regenerating function source.
    let anchor = start;
    const initial = new Set<Node>();
    for (const statement of ordinary) {
      if (statement.type !== 'FunctionDeclaration') break;
      initial.add(statement);
      anchor = statement.end;
    }
    for (const declaration of declarations) {
      const commentStart = leadingComment(declaration, start);
      if (!initial.has(declaration)) code.move(commentStart, declaration.end, anchor);
      if (commentStart < declaration.start) code.prependLeft(commentStart, '\n');
      code.move(declaration.start, declaration.id.start, declaration.id.end);
      code.appendLeft(declaration.id.end, ' = ');
      code.appendLeft(declaration.end, ';');
    }
    for (const node of scope.defers) {
      const arrow = `${node.awaited ? 'async ' : ''}() => `;
      const prefix = single
        ? `${stack} = ${arrow}`
        : `(${stack} ??= []).push(${mixed ? `{ async: ${node.awaited}, run: ` : ''}${arrow}`;
      code.overwrite(node.start, node.cleanup.body.start, prefix);
      code.appendLeft(node.end, single ? ';' : `${mixed ? '}' : ''});`);
    }
    if (single) {
      // Guard the await as well as the call: unreached async cleanup must not
      // add a microtask turn. Native finally preserves all completion kinds.
      const call = allAsync ? `if (${stack}) await ${stack}();` : `${stack}?.();`;
      code.appendLeft(block.end - 1, `\n} finally { ${call} }\n`);
      continue;
    }
    if (!anyAsync) {
      let body: string;
      if (runtime === 'external') {
        if (sourceType !== 'module')
          fail(
            scope.defers[0]!,
            'External runtime helpers require module sourceType; use runtime: inline for scripts.',
          );
        sharedHelper ??= fresh('RunDefers');
        body = `${sharedHelper}(${stack});`;
      } else body = syncDeferBody({ stack, failed, failure, cleanup: callback, error });
      code.appendLeft(block.end - 1, `} finally { ${body} }`);
      continue;
    }
    const call = mixed
      ? `if (${callback}.async) await ${callback}.run(); else ${callback}.run();`
      : `${allAsync ? 'await ' : ''}${callback}();`;
    // Nested-finally semantics: every registered cleanup runs, and the last
    // cleanup failure replaces an earlier cleanup/body failure (even undefined).
    code.appendLeft(
      block.end - 1,
      `} finally { let ${failed} = false, ${failure}; while (${stack}?.length) { const ${callback} = ${stack}.pop(); if (${callback}) { try { ${call} } catch (${error}) { ${failed} = true; ${failure} = ${error}; } } } if (${failed}) throw ${failure}; }`,
    );
  }
  if (sharedHelper) {
    // Keep shebangs, file pragmas and the directive prologue before imports.
    // An adjacent declaration JSDoc/suppression stays with its original node.
    const statement = ast.body.find((node: Node) => !node.directive)!;
    let start = statement.start;
    for (const comment of sortedComments) {
      if (comment.end > start) continue;
      if (/\S/.test(source.slice(comment.end, start))) break;
      if (
        (source.startsWith('/**', comment.start) ||
          /@ts-(?:ignore|expect-error)\b/.test(comment.value)) &&
        !/@(?:ts-(?:check|nocheck)|jsxImportSource|jsxRuntime)\b/.test(comment.value)
      )
        start = comment.start;
      else break;
    }
    code.prependLeft(
      start,
      `\nimport { runDefers as ${sharedHelper} } from '@swiftuijs/twill-runtime/helpers/v1';\n`,
    );
  }
}
