import MagicString from 'magic-string';
import { Parser, tokTypes } from 'acorn';
import type { Language } from './compiler.js';

type Node = { type: string; start: number; end: number; [key: string]: any };
function suspension(node: Node): Node | undefined {
  if (['AwaitExpression', 'YieldExpression'].includes(node.type)) return node;
  if (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(node.type))
    return;
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'trailing', 'tag'].includes(key)) continue;
    for (const child of Array.isArray(value) ? value : [value]) {
      if (child?.type) {
        const found = suspension(child);
        if (found) return found;
      }
    }
  }
}

/** Native switches with per-arm scopes; expression contexts use a synchronous
 * lexical IIFE. Direct returns need no extra function or scheduling. */
export function lowerSwitchExpressions(
  source: string,
  ast: Node,
  switches: Node[],
  code: MagicString,
  language: Language,
  usedNames: Set<string>,
  fail: (node: Node, message: string) => never,
) {
  const returns = new Set<Node>();
  const visit = (node: Node) => {
    if (node.type === 'ReturnStatement' && node.argument?.type === 'TwillSwitchExpression') {
      returns.add(node.argument);
      code.remove(node.start, node.start + 6);
      // Acorn omits grouping parentheses from expression node ranges.
      // Preserve comments while removing only the return's outer grouping.
      for (const [start, end] of [
        [node.start + 6, node.argument.start],
        [node.argument.end, node.end],
      ]) {
        const tokens = Parser.tokenizer(source.slice(start, end), { ecmaVersion: 'latest' });
        for (;;) {
          const token = tokens.getToken();
          if (token.type === tokTypes.eof) break;
          if (token.type === tokTypes.parenL || token.type === tokTypes.parenR)
            code.remove(start + token.start, start + token.end);
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'trailing', 'tag'].includes(key)) continue;
      for (const child of Array.isArray(value) ? value : [value]) if (child?.type) visit(child);
    }
  };
  visit(ast);
  let counter = 0;
  const fresh = (part: string) => {
    let name: string;
    do name = `__twill${part}${counter++}`;
    while (usedNames.has(name));
    usedNames.add(name);
    return name;
  };
  for (const node of switches) {
    const direct = returns.has(node);
    const suspended = !direct && suspension(node);
    if (suspended)
      fail(
        suspended,
        'await/yield inside a switch expression requires a direct return. Bind the subject first, or await the whole result explicitly.',
      );
    const subject = fresh('Subject');
    const kind = node.cases.some((branch: Node) => branch.enumPattern) ? fresh('Kind') : undefined;
    code.appendLeft(node.start, `${direct ? '{' : '(() => {'}const ${subject} = `);
    code.remove(node.parenStart, node.parenStart + 1);
    // Retain a real source-backed switch token for typed lint diagnostics.
    code.move(node.start, node.start + 6, node.parenEnd);
    code.appendLeft(node.parenEnd, `; ${kind ? `const ${kind} = ${subject}["kind"]; ` : ''}`);
    code.overwrite(
      node.parenEnd,
      node.parenEnd + 1,
      ` (${kind ?? subject}${kind || node.discriminator === undefined ? '' : `[${JSON.stringify(node.discriminator)}]`})`,
    );
    for (const branch of node.cases) {
      if (branch.enumPattern) {
        const { reference, binding, start, parenStart, parenEnd } = branch.enumPattern;
        const tag = JSON.stringify(reference.property.name);
        if (language.startsWith('ts')) {
          // A type-only factory witness checks the reference and literal tag.
          // Native TS erases it; matching performs no factory/property lookup.
          code.overwrite(start, start + 4, `(${tag} satisfies (typeof `);
          code.appendLeft(
            reference.end,
            ` extends (...args: never[]) => { readonly kind: ${tag} } ? ${tag} : never))`,
          );
        } else {
          code.overwrite(start, start + 4, tag);
          code.remove(reference.start, reference.end);
        }
        code.remove(parenStart, parenStart + 1);
        code.remove(parenEnd, parenEnd + 1);
        if (binding) {
          code.appendLeft(binding.start, ': { const ');
          code.overwrite(
            branch.colonStart,
            branch.colonStart + 1,
            ` = ${subject}; ${branch.throw ? '' : 'return '}`,
          );
          code.appendLeft(branch.valueEnd, '; }');
          if (source[branch.end - 1] === ';') code.remove(branch.end - 1, branch.end);
        } else if (!branch.throw) code.appendLeft(branch.colonStart + 1, ' return ');
      } else if (branch.pattern) {
        const { pattern, tag } = branch;
        // A discarded discriminator binding preserves native rest exclusion.
        // Its key remains source-backed; the literal moves to the case label.
        code.appendLeft(tag.value.start, fresh('Tag'));
        code.move(tag.value.start, tag.value.end, pattern.start);
        code.appendLeft(tag.value.end, ': { const ');
        code.overwrite(
          branch.colonStart,
          branch.colonStart + 1,
          ` = ${subject}; ${branch.throw ? '' : 'return '}`,
        );
        code.appendLeft(branch.valueEnd, '; }');
        if (source[branch.end - 1] === ';') code.remove(branch.end - 1, branch.end);
      } else if (!branch.throw) code.appendLeft(branch.colonStart + 1, ' return ');
    }
    const hasDefault = node.cases.some(
      (branch: Node) => !branch.pattern && !branch.enumPattern && branch.test === null,
    );
    const check =
      !hasDefault && language.startsWith('ts')
        ? ` ${kind ? `(0 as unknown as typeof ${kind})` : subject} satisfies never;`
        : '';
    // Transpile-only JS hosts cannot prove unions. Unexpected values fail
    // visibly rather than returning an accidental undefined.
    const failure = hasDefault
      ? ''
      : `${check} throw new TypeError('Non-exhaustive switch expression');`;
    code.overwrite(node.end - 1, node.end, `}${failure}${direct ? '}' : '})()'}`, {
      contentOnly: true,
    });
  }
}
