// Acorn's extension hooks intentionally use its internal AST shape. Keep that
// boundary here; the public compiler API is typed in compiler.ts.
import { Parser, tokTypes as tt, getLineInfo } from 'acorn';
import { tsPlugin } from 'acorn-typescript';
import jsx from 'acorn-jsx';

const options = { ecmaVersion: 'latest', sourceType: 'module', locations: true };
const bases = {
  js: Parser,
  jsx: Parser.extend(jsx()),
  ts: Parser.extend(tsPlugin({ allowSatisfies: true })),
  tsx: Parser.extend(tsPlugin({ allowSatisfies: true })),
};

// Inspect only the possible parameter header, using real tokens so comments,
// strings, default arguments and destructuring cannot confuse the delimiter.
function headerAt(input, offset) {
  const lexer = Parser.tokenizer(input.slice(offset), options);
  const stack = [];
  let first = true;
  const tokens = [];
  try {
    for (;;) {
      const token = lexer.getToken();
      const label = token.type.label;
      if (first && label !== 'name' && label !== '(') return null;
      first = false;
      if (!stack.length && label === 'in') {
        const async = tokens.length > 1 && tokens[0].value === 'async';
        const firstParam = tokens[async ? 1 : 0];
        return {
          start: offset,
          end: offset + token.end,
          inStart: offset + token.start,
          text: input.slice(offset + tokens[0].start, offset + tokens.at(-1).end),
          textStart: offset + tokens[0].start,
          async,
          asyncEnd: async ? offset + tokens[0].end : null,
          parenthesized: firstParam.type.label === '(',
        };
      }
      if (label === 'eof' || (!stack.length && [';', '{', '}', '=>'].includes(label))) return null;
      if (['(', '[', '{'].includes(label)) stack.push(label);
      if ([')', ']', '}'].includes(label)) {
        if (!stack.length) return null;
        stack.pop();
      }
      tokens.push(token);
    }
  } catch {
    return null;
  }
}

function moveNodes(node, delta, input) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.start === 'number') {
    node.start += delta;
    node.end += delta;
    node.loc = { start: getLineInfo(input, node.start), end: getLineInfo(input, node.end) };
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc') continue;
    if (Array.isArray(value)) value.forEach((item) => moveNodes(item, delta, input));
    else if (value && typeof value === 'object') moveNodes(value, delta, input);
  }
}

export function parse(source, language = 'ts', sourceType = 'module') {
  const Base = bases[language];
  const closures = [];
  class TrailingParser extends Base {
    skipHeader = null;

    tsParseTypeParameter(...args) {
      const start = this.start;
      const loc = this.startLoc;
      const constant = this.type === tt._const;
      if (constant) this.next();
      const parameter = super.tsParseTypeParameter(...args);
      if (constant) {
        parameter.const = true;
        parameter.start = start;
        parameter.loc.start = loc;
      }
      return parameter;
    }

    readToken(code) {
      // acorn-typescript enables JSX by default. Plain .tts follows TypeScript's
      // non-JSX grammar, including angle-bracket assertions.
      if (language === 'ts' && code === 60 && !this.inType && this.exprAllowed)
        return this.readToken_lt_gt(code);
      return super.readToken(code);
    }

    parseExprAtom(...args) {
      if (language === 'ts' && this.type === tt.relational && this.value === '<') {
        const node = this.startNode();
        this.tsInType(() => {
          this.next();
          node.typeAnnotation = this.tsParseType();
          if (!this.tsMatchRightRelational()) this.unexpected();
          this.next();
        });
        node.expression = this.parseMaybeUnary(null, false, false, args[1]);
        // Let the TS plugin backtrack and recognize a generic arrow function.
        if (node.expression.type === 'ArrowFunctionExpression') this.unexpected(node.start);
        return this.finishNode(node, 'TSTypeAssertion');
      }
      return super.parseExprAtom(...args);
    }

    next(...args) {
      super.next(...args);
      if (this.skipHeader !== null) {
        const end = this.skipHeader;
        this.skipHeader = null;
        while (this.start < end && this.type !== tt.eof) super.next(...args);
      }
    }

    parseTrailingClosure(callee, label) {
      const start = this.start;
      const header = headerAt(this.input, this.end);
      let params = [];
      let async = false;
      let parameterText = '()';
      if (header) {
        let text = header.text.trim();
        async = header.async;
        if (async) text = text.replace(/^async\s+/, '');
        parameterText = text.startsWith('(') ? text : `(${text})`;
        const prefix = async ? 'async ' : '';
        try {
          const arrow = Base.parse(`${prefix}${parameterText} => {}`, { ...options, sourceType })
            .body[0].expression;
          params = arrow.params;
          const sourceStart = header.textStart + header.text.indexOf(text);
          const addedParen = text.startsWith('(') ? 0 : 1;
          params.forEach((param) =>
            moveNodes(param, sourceStart - prefix.length - addedParen, source),
          );
        } catch (error) {
          this.raise(start, `Invalid trailing closure parameters: ${error.message}`);
        }
      }
      const node = this.startNode();
      // parseArrowExpression supplies the real function scope, including return,
      // await, lexical this/super, duplicate bindings and strict-mode checks.
      this.skipHeader = header?.end ?? null;
      const arrow = this.parseArrowExpression(node, params, async, false);
      closures.push({ node: arrow, callee, label, header, parameterText, async });
      return arrow;
    }

    parseSubscript(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit) {
      const supported = ['CallExpression', 'Identifier', 'MemberExpression'].includes(base.type);
      if (!noCalls && supported && this.type === tt.braceL) {
        if (base.trailing)
          this.raise(
            this.start,
            'Additional trailing closures require labels (for example completion: { ... }).',
          );
        // Bare names on a new line remain ordinary JavaScript statements.
        if (base.type !== 'CallExpression' && /[\r\n]/.test(this.input.slice(base.end, this.start)))
          return base;
        const hadParens = base.type === 'CallExpression' && base.end === this.lastTokEnd;
        const callee = hadParens ? base.callee : base;
        const node = this.startNodeAt(startPos, startLoc);
        node.callee = callee;
        node.arguments = hadParens ? [...base.arguments] : [];
        node.optional = base.optional ?? false;
        const callEnd = this.lastTokEnd;
        const args = [this.parseTrailingClosure(callee, null)];
        while (this.type === tt.name) {
          const tail = this.input.slice(this.end);
          // Only recognize a label when a colon and opening brace follow it.
          const lexer = Parser.tokenizer(tail, options);
          const colon = lexer.getToken();
          if (colon.type !== tt.colon || lexer.getToken().type !== tt.braceL) break;
          const label = { name: this.value, start: this.start, end: this.end };
          this.next();
          this.expect(tt.colon);
          args.push(this.parseTrailingClosure(callee, label));
        }
        node.arguments.push(...args);
        node.trailing = {
          callEnd,
          hadParens,
          originalArgs: hadParens ? base.arguments : [],
          closures: args,
        };
        return this.finishNode(node, 'CallExpression');
      }
      return super.parseSubscript(
        base,
        startPos,
        startLoc,
        noCalls,
        maybeAsyncArrow,
        optionalChained,
        forInit,
      );
    }
  }
  const ast = TrailingParser.parse(source, { ...options, sourceType, allowHashBang: true });
  const live = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type) live.add(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === 'trailing' || key === 'loc') continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value?.type) visit(value);
    }
  };
  visit(ast);
  return { ast, closures: closures.filter((closure) => live.has(closure.node)) };
}
