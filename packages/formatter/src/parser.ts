import MagicString from 'magic-string';
import * as typescript from 'prettier/plugins/typescript';
import { Parser, tokTypes } from 'acorn';
import { parseSyntax } from '@swiftuijs/twill/syntax';
import { originalPosition, type TransformResult } from '@swiftuijs/twill';
import type { ParserOptions } from 'prettier';

type Node = { type: string; start: number; end: number; [key: string]: any };

/** Parse native syntax through Prettier's own TS parser. Only sugar is masked;
 * no implicit returns, JSX collectors or cleanup helpers enter the printer. */
export async function parse(source: string, options: ParserOptions<any>) {
  const filename = options.filepath ?? 'input.twill';
  const parsed = parseSyntax(source, { filename });
  const layout = new MagicString(source);
  const enumsByStart = new Map<number, any>();
  const enumCasesByStart = new Map<number, any>();
  for (const declaration of parsed.enums) {
    enumsByStart.set(declaration.start, declaration);
    layout.overwrite(declaration.start, declaration.start + 4, 'interface');
    for (const branch of declaration.cases) {
      enumCasesByStart.set(branch.id.start, branch);
      layout.remove(branch.start, branch.start + 4);
      if (!branch.hasParens) layout.appendLeft(branch.id.end, '()');
      layout.appendLeft(branch.valueEnd, ': unknown');
    }
  }
  const implicitMembers = new Set<number>(
    parsed.closures.flatMap((closure: any) => closure.implicitMembers),
  );
  for (const offset of implicitMembers) layout.appendLeft(offset, '__twillImplicit');
  const labels = new Map<string, any>();
  for (const guard of parsed.guards) {
    if (guard.binding) {
      let label = `__TwillGuard${labels.size}`;
      while (source.includes(label)) label += '_';
      labels.set(label, guard);
      layout.remove(guard.start, guard.start + 5);
      layout.overwrite(guard.elseStart, guard.elseStart + 4, `; ${label}:`);
    } else {
      layout.overwrite(guard.start, guard.start + 5, 'if (');
      layout.overwrite(guard.elseStart, guard.elseStart + 4, ')');
    }
  }
  const switchesByEnd = new Map<number, any>();
  const casesByStart = new Map<number, any>();
  const tagNames = new Map<number, string>();
  for (const expression of parsed.switches) {
    let temporary = `__TwillSwitch${switchesByEnd.size}`;
    while (source.includes(temporary)) temporary += '_';
    switchesByEnd.set(expression.end, expression);
    layout.overwrite(
      expression.start,
      expression.start + expression.keyword.length,
      `(() => { const ${temporary} = `,
    );
    layout.remove(expression.parenStart, expression.parenStart + 1);
    if (expression.keyword === 'match') {
      const tokens = Parser.tokenizer(
        source.slice(expression.discriminant.end, expression.parenEnd),
        {
          ecmaVersion: 'latest',
        },
      );
      for (;;) {
        const token = tokens.getToken();
        if (token.type === tokTypes.eof) break;
        if (token.type === tokTypes.comma)
          layout.remove(
            expression.discriminant.end + token.start,
            expression.discriminant.end + token.end,
          );
      }
    }
    layout.overwrite(expression.parenEnd, expression.parenEnd + 1, `; switch (${temporary})`);
    layout.overwrite(expression.end - 1, expression.end, '}})()', { contentOnly: true });
    for (const branch of expression.cases) {
      casesByStart.set(branch.start, branch);
      if (branch.enumPattern) {
        const { binding, parenStart, parenEnd, start } = branch.enumPattern;
        if (branch.enumPattern.explicitKeyword) layout.remove(start, start + 4);
        layout.remove(parenStart, parenStart + 1);
        layout.remove(parenEnd, parenEnd + 1);
        if (binding) {
          layout.appendLeft(binding.start, ': { const ');
          layout.overwrite(
            branch.colonStart,
            branch.colonStart + 1,
            ` = undefined; ${branch.throw ? '' : 'return '}`,
          );
          layout.appendLeft(branch.valueEnd, '; }');
          if (source[branch.end - 1] === ';') layout.remove(branch.end - 1, branch.end);
        } else if (!branch.throw) layout.appendLeft(branch.colonStart + 1, ' return ');
      } else if (branch.pattern) {
        layout.overwrite(branch.start, branch.pattern.start, 'case 0: { const ');
        tagNames.set(branch.start, temporary + 'Tag');
        layout.overwrite(branch.tag.value.start, branch.tag.value.end, temporary + 'Tag');
        layout.overwrite(
          branch.colonStart,
          branch.colonStart + 1,
          ` = undefined; ${branch.throw ? '' : 'return '}`,
        );
        layout.appendLeft(branch.valueEnd, '; }');
        if (source[branch.end - 1] === ';') layout.remove(branch.end - 1, branch.end);
      } else if (!branch.throw) layout.appendLeft(branch.colonStart + 1, ' return ');
    }
  }
  const closures = new Map<number, any>(parsed.closures.map((item: any) => [item.node, item]));
  for (const call of parsed.calls) {
    const { hadParens, callEnd, originalArgs } = call.trailing;
    if (hadParens) {
      const tailStart = originalArgs.at(-1)?.end ?? callEnd - 1;
      const token = Parser.tokenizer(source.slice(tailStart, callEnd - 1), {
        ecmaVersion: 'latest',
      }).getToken();
      if (token.type === tokTypes.comma)
        layout.remove(tailStart + token.start, tailStart + token.end);
      layout.overwrite(callEnd - 1, callEnd, originalArgs.length ? ',' : '');
    } else layout.appendLeft(callEnd, '(');
    for (const closure of call.trailing.closures) {
      const item = closures.get(closure) as any;
      if (item.label) layout.overwrite(item.label.start, closure.start, ', ');
      if (item.header) {
        const header = item.header;
        layout.overwrite(
          closure.start,
          closure.start + 1,
          header.parenthesized || item.async ? '' : '(',
        );
        if (item.async && !header.parenthesized) layout.appendLeft(header.asyncEnd, ' (');
        layout.overwrite(header.inStart, header.end, `${header.parenthesized ? '' : ') '}=> {`);
      } else layout.overwrite(closure.start, closure.start + 1, '() => {');
    }
    layout.appendLeft(call.end, ')');
  }
  for (const defer of parsed.defers) {
    layout.overwrite(
      defer.start,
      defer.cleanup.body.start,
      defer.awaited ? '(async () => ' : '(() => ',
    );
    layout.appendLeft(defer.end, ')();');
  }
  const code = layout.toString();
  const result = {
    code,
    map: layout.generateMap({ source: filename, hires: true, includeContent: true }),
  } as TransformResult;
  const lineStarts = (text: string) => {
    const starts = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
    return starts;
  };
  const generatedLines = lineStarts(code),
    sourceLines = lineStarts(source);
  const implicitStarts = new Map<number, number>();
  const originalOffset = (offset: number) => {
    if (implicitStarts.has(offset)) return implicitStarts.get(offset)!;
    let low = 0,
      high = generatedLines.length;
    while (low + 1 < high) {
      const mid = (low + high) >>> 1;
      if (generatedLines[mid]! <= offset) low = mid;
      else high = mid;
    }
    const position = originalPosition(result, low + 1, offset - generatedLines[low]!);
    if (position.line == null || position.column == null) return offset === 0 ? 0 : source.length;
    return sourceLines[position.line - 1]! + position.column;
  };
  for (const match of code.matchAll(/__twillImplicit(?=\.)/g)) {
    const dot = originalOffset(match.index! + match[0].length);
    if (implicitMembers.has(dot)) implicitStarts.set(match.index!, dot);
  }
  const closuresByEnd = new Map<number, any>(
    parsed.closures.map((item: any) => [item.node.end, item]),
  );
  const callsByEnd = new Map<number, any>(
    parsed.calls.map((item: any) => [item.trailing.closures.at(-1).end, item]),
  );
  const guardsByStart = new Map<number, any>(
    parsed.guards.filter((item: any) => !item.binding).map((item: any) => [item.test.start, item]),
  );
  const defersByEnd = new Map<number, any>(
    parsed.defers.map((item: any) => [item.cleanup.body.end, item]),
  );
  const ast = await typescript.parsers.typescript!.parse(code, {
    ...options,
    parser: 'typescript',
    filepath: filename.endsWith('.twillx') ? filename + '.tsx' : filename + '.ts',
  });
  const visit = (node: Node) => {
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'range', 'tokens', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) {
        value.forEach((child) => {
          if (child?.type) visit(child);
        });
        for (let index = 1; index < value.length; index++) {
          const current = value[index];
          if (current?.type === 'LabeledStatement' && labels.has(current.label.name)) {
            const guard = labels.get(current.label.name);
            const binding = value[index - 1];
            binding.type = 'TwillGuardBinding';
            value.splice(index - 1, 2, {
              type: 'GuardStatement',
              start: guard.start,
              end: guard.end,
              range: [guard.start, guard.end],
              binding,
              failure: current.body,
            });
            index--;
          }
        }
      } else if (value?.type) visit(value);
    }
    if (!node.range) return;
    const [start, end] = node.range;
    node.start = originalOffset(start);
    node.end = end > start ? originalOffset(end - 1) + 1 : node.start;
    node.range = [node.start, node.end];
    if (node.type === 'TSMethodSignature') {
      const branch = enumCasesByStart.get(node.key.start);
      if (branch) {
        node.type = 'TwillEnumCase';
        node.id = node.key;
        node.hasParens = branch.hasParens;
        node.start = branch.start;
        node.end = branch.end;
        node.range = [node.start, node.end];
        delete node.returnType;
        delete node.key;
      }
    }
    if (node.type === 'TSInterfaceDeclaration') {
      const declaration = enumsByStart.get(node.start);
      if (declaration) {
        node.type = 'TwillEnumDeclaration';
        node.cases = node.body.body;
        node.end = declaration.end;
        node.range = [node.start, node.end];
        delete node.body;
      }
    }
    if (
      node.type === 'Identifier' &&
      node.name === '__twillImplicit' &&
      implicitMembers.has(originalOffset(end))
    ) {
      node.name = '';
      node.start = originalOffset(end);
      node.end = node.start;
      node.range = [node.start, node.end];
    }
    if (node.type === 'ArrowFunctionExpression' && node.body.type === 'BlockStatement') {
      const closure = closuresByEnd.get(node.body.end);
      if (closure) {
        node.type = 'TwillClosure';
        node.header = closure.header;
        node.label = closure.label?.name;
        node.start = closure.label?.start ?? closure.node.start;
        node.end = closure.node.end;
        node.body.start = closure.header?.end ?? closure.node.start;
        node.body.range[0] = node.body.start;
        node.range = [node.start, node.end];
      }
    }
    if (node.type === 'SwitchCase') {
      const branch = casesByStart.get(node.start);
      if (branch) {
        node.type = 'TwillSwitchCase';
        const statements =
          branch.pattern || branch.enumPattern?.binding ? node.consequent[0].body : node.consequent;
        node.value = statements.at(-1).argument;
        node.throw = branch.throw;
        if (branch.enumPattern) {
          node.enumPattern = {
            type: 'TwillEnumPattern',
            explicitKeyword: branch.enumPattern.explicitKeyword,
            start: branch.enumPattern.start,
            end: branch.enumPattern.end,
            range: [branch.enumPattern.start, branch.enumPattern.end],
            reference: node.test,
            binding: branch.enumPattern.binding ? statements[0].declarations[0].id : null,
          };
          delete node.test;
        }
        if (branch.pattern) {
          node.pattern = statements[0].declarations[0].id;
          const tag = node.pattern.properties.find(
            (property: Node) => property.value?.name === tagNames.get(branch.start),
          );
          tag.value = {
            ...branch.tag.value,
            range: [branch.tag.value.start, branch.tag.value.end],
          };
        }
        delete node.consequent;
        node.start = branch.start;
        node.end = branch.end;
        node.range = [node.start, node.end];
      }
    }
    if (node.type === 'CallExpression' && node.callee.type === 'ArrowFunctionExpression') {
      const expression = switchesByEnd.get(node.end);
      if (expression && node.callee.body.body[1]?.type === 'SwitchStatement') {
        node.type = 'TwillSwitchExpression';
        node.keyword = expression.keyword;
        node.discriminant = node.callee.body.body[0].declarations[0].init;
        node.cases = node.callee.body.body[1].cases;
        delete node.callee;
        delete node.arguments;
        node.start = expression.start;
        node.end = expression.end;
        node.range = [node.start, node.end];
      }
    }
    if (node.type === 'CallExpression') {
      const call =
        node.arguments.at(-1)?.type === 'TwillClosure'
          ? callsByEnd.get(node.arguments.at(-1).end)
          : undefined;
      if (call) {
        const native: Node = {
          ...node,
          arguments: node.arguments.slice(0, call.trailing.originalArgs.length),
          start: call.start,
          end: call.trailing.callEnd,
          range: [call.start, call.trailing.callEnd],
        };
        if (call.start !== call.callee.start)
          native.callee = {
            type: 'TwillParenthesized',
            start: call.start,
            end: call.callee.end + 1,
            expression: native.callee,
          };
        if (!call.trailing.hadParens) native.type = 'TwillBareCall';
        node.type = 'TwillCall';
        node.call = native;
        node.closures = node.arguments.slice(call.trailing.originalArgs.length);
        delete node.callee;
        delete node.arguments;
        delete node.typeArguments;
        node.start = call.start;
        node.end = call.end;
        node.range = [call.start, call.end];
      }
    }
    if (node.type === 'IfStatement') {
      const guard = guardsByStart.get(node.test.start);
      if (guard) {
        node.type = 'GuardStatement';
        node.failure = node.consequent;
        node.start = guard.start;
        node.end = guard.end;
        node.range = [guard.start, guard.end];
        delete node.consequent;
      }
    }
    if (
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression' &&
      node.expression.callee.type === 'ArrowFunctionExpression'
    ) {
      const cleanup = node.expression.callee;
      const defer = defersByEnd.get(cleanup.body.end);
      if (defer) {
        node.type = 'DeferStatement';
        node.cleanup = cleanup;
        node.start = defer.start;
        node.end = defer.end;
        node.range = [defer.start, defer.end];
        delete node.expression;
      }
    }
  };
  visit(ast);
  const seen = new Set<string>();
  ast.comments = parsed.comments
    .filter((comment: any) => {
      const key = `${comment.start}:${comment.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((comment: any) => ({ ...comment, range: [comment.start, comment.end] }));
  ast.start = 0;
  ast.end = source.length;
  ast.range = [0, source.length];
  return ast;
}
