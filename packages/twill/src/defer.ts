import MagicString from 'magic-string';
import type { Language } from './compiler.js';

type Node = { type: string; start: number; end: number; [key: string]: any };
type Comment = { start: number; end: number; value: string; type: string };
type Scope = { block: Node; functionBody: boolean; defers: Node[] };
const functions = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

function children(node: Node, visit: (child: Node) => void) {
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'trailing') continue;
    if (Array.isArray(value))
      value.forEach((child) => {
        if (child?.type) visit(child);
      });
    else if (value?.type) visit(value);
  }
}

/** Scope-local cleanup callbacks; dynamic registrations use lazy stacks. */
export function lowerDefers(
  source: string,
  ast: Node,
  code: MagicString,
  language: Language,
  usedNames: Set<string>,
  contentStarts: Map<Node, number>,
  comments: Comment[],
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
  for (const scope of scopes) {
    if (!scope.defers.length) continue;
    const { block } = scope;
    const statements = block.body as Node[];
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
    const storageType = single ? '(() => unknown) | undefined' : `Array<${callbackType}> | undefined`;
    const annotation = language.startsWith('ts') ? `: ${storageType}` : '';
    const jsdoc = language.startsWith('js')
      ? `\n/** @type {${storageType}} */\n`
      : '';
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
    code.appendLeft(
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
      code.prependLeft(block.end - 1, `\n} finally { ${call} }\n`);
      continue;
    }
    const call = mixed
      ? `if (${callback}.async) await ${callback}.run(); else ${callback}.run();`
      : `${allAsync ? 'await ' : ''}${callback}();`;
    // Nested-finally semantics: every registered cleanup runs, and the last
    // cleanup failure replaces an earlier cleanup/body failure (even undefined).
    code.prependLeft(
      block.end - 1,
      `} finally { let ${failed} = false, ${failure}; while (${stack}?.length) { const ${callback} = ${stack}.pop(); if (${callback}) { try { ${call} } catch (${error}) { ${failed} = true; ${failure} = ${error}; } } } if (${failed}) throw ${failure}; }`,
    );
  }
}
