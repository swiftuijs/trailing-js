import { parse } from '@babel/parser';

/** Conservative source rewrite: preserve dynamic-this function callbacks. */
export function rewrite(source) {
  const ast = parse(source, { sourceType: 'module' });
  const edits = [];
  function negate(node) {
    if (node.type === 'UnaryExpression' && node.operator === '!')
      return source.slice(node.argument.start, node.argument.end);
    const inverse = { '===': '!==', '!==': '===', '==': '!=', '!=': '==' };
    if (node.type === 'BinaryExpression' && inverse[node.operator])
      return `(${source.slice(node.left.start, node.left.end)}) ${inverse[node.operator]} (${source.slice(node.right.start, node.right.end)})`;
    return `!(${source.slice(node.start, node.end)})`;
  }
  let guards = 0;
  let closures = 0;
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'IfStatement' &&
      !node.alternate &&
      node.consequent.type === 'BlockStatement'
    ) {
      const last = node.consequent.body.at(-1);
      if (last && ['ReturnStatement', 'ThrowStatement'].includes(last.type)) {
        edits.push([node.start, node.consequent.start, `guard ${negate(node.test)} else `]);
        guards++;
      }
    }
    if (node.type === 'CallExpression' && !node.optional) {
      const callback = node.arguments.at(-1);
      // Expression callbacks have explicit returns after rewriting, including
      // object literals. No changes to named/dynamic-this function expressions.
      if (
        callback?.type === 'ArrowFunctionExpression' &&
        callback.body.type !== 'BlockStatement' &&
        !callback.async
      ) {
        const previous = node.arguments.at(-2);
        const separator = previous ? previous.end : node.callee.end + 1;
        const parameters = callback.params
          .map((param) => source.slice(param.start, param.end))
          .join(', ');
        edits.push([separator, callback.body.start, `) { (${parameters}) in return `]);
        edits.push([callback.body.end, node.end, '; }']);
        closures++;
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'comments', 'tokens', 'extra'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  walk(ast);
  edits.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < edits.length; i++) {
    if (edits[i][0] < edits[i - 1][1]) throw new Error('Overlapping React source rewrite');
  }
  let code = source;
  for (const [start, end, replacement] of edits.reverse())
    code = code.slice(0, start) + replacement + code.slice(end);
  return { code, guards, closures };
}
