// Acorn's extension hooks intentionally use its internal AST shape. Keep that
// boundary here; the public compiler API is typed in compiler.ts.
import { Parser, tokTypes as tt } from 'acorn';
import { tsPlugin } from 'acorn-typescript';
import jsx from 'acorn-jsx';

const options = { ecmaVersion: 'latest', sourceType: 'module', locations: true };
const bases = {
  js: Parser,
  jsx: Parser.extend(jsx()),
  ts: Parser.extend(tsPlugin({ allowSatisfies: true })),
  tsx: Parser.extend(tsPlugin({ allowSatisfies: true })),
};

// `guard` remains an ordinary JS identifier unless its expression is followed
// by a top-level `else`. Token lookahead ignores strings/comments and balanced
// groups; it never rewrites source or attempts to parse the expression itself.
function guardAt(input, offset) {
  const lexer = Parser.tokenizer(input.slice(offset), { ecmaVersion: 'latest' });
  const stack = [];
  let first = true;
  try {
    for (;;) {
      const token = lexer.getToken();
      const label = token.type.label;
      if (
        first &&
        ['=', '.', '?.', ':', '++/--', '*', '/', '%', '==/!=/===/!==', 'in', 'instanceof'].includes(
          label,
        )
      )
        return false;
      if (
        !stack.length &&
        ['if', 'for', 'while', 'switch', 'try', 'return', 'throw', 'var', 'export'].includes(label)
      )
        return false;
      if (!first && !stack.length && label === 'const') return false;
      first = false;
      if (!stack.length && label === 'else') return true;
      if (!stack.length && ['eof', ';', '}'].includes(label)) return false;
      if (['(', '[', '{', '${'].includes(label)) stack.push(label);
      else if ([')', ']', '}'].includes(label)) {
        if (!stack.length) return false;
        stack.pop();
      }
    }
  } catch {
    return false;
  }
}

// Deliberately conservative: do not infer exits from calls, loops or a nested
// function's return. JS/TS still checks the legality of break/continue/return.
function exits(node) {
  switch (node.type) {
    case 'ReturnStatement':
    case 'ThrowStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return true;
    case 'BlockStatement':
      return node.body.some(exits);
    case 'IfStatement':
      return !!node.alternate && exits(node.consequent) && exits(node.alternate);
    default:
      return false;
  }
}

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

function moveNodes(node, delta, locate) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.start === 'number') {
    node.start += delta;
    node.end += delta;
    node.loc = { start: locate(node.start), end: locate(node.end) };
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc') continue;
    if (Array.isArray(value)) value.forEach((item) => moveNodes(item, delta, locate));
    else if (value && typeof value === 'object') moveNodes(value, delta, locate);
  }
}

const parsers = new Map();
function parserFor(language) {
  if (parsers.has(language)) return parsers.get(language);
  const Base = bases[language];
  class TrailingParser extends Base {
    skipHeader = null;
    closures = [];
    lineStarts = null;

    locate(offset) {
      if (!this.lineStarts) {
        this.lineStarts = [0];
        const breaks = /\r\n?|\n|\u2028|\u2029/g;
        let match;
        while ((match = breaks.exec(this.input))) this.lineStarts.push(breaks.lastIndex);
      }
      let low = 0;
      let high = this.lineStarts.length;
      while (low + 1 < high) {
        const mid = (low + high) >>> 1;
        if (this.lineStarts[mid] <= offset) low = mid;
        else high = mid;
      }
      return { line: low + 1, column: offset - this.lineStarts[low] };
    }

    parseStatement(context, ...args) {
      if (!this.isContextual('guard') || !guardAt(this.input, this.end))
        return super.parseStatement(context, ...args);
      const node = this.startNode();
      this.next();
      node.binding = null;
      if (this.type === tt._const) {
        if (context)
          this.raise(node.start, 'A guard binding requires a block; add braces around this body.');
        const declaration = this.startNode();
        this.next();
        this.parseVar(declaration, false, 'const');
        node.binding = this.finishNode(declaration, 'VariableDeclaration');
        if (
          node.binding.declarations.length !== 1 ||
          node.binding.declarations[0].id.type !== 'Identifier'
        )
          this.raise(node.start, 'guard const requires one identifier binding.');
      } else node.test = this.parseExpression();
      node.elseStart = this.start;
      this.expect(tt._else);
      if (this.type !== tt.braceL) this.unexpected();
      node.failure = this.parseBlock();
      if (!exits(node.failure))
        this.raise(
          node.failure.start,
          'Every guard else path must exit with return, throw, break or continue.',
        );
      return this.finishNode(node, 'GuardStatement');
    }

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
          const arrow = Base.parse(`${prefix}${parameterText} => {}`, {
            ...options,
            sourceType: this.options.sourceType,
          }).body[0].expression;
          params = arrow.params;
          const sourceStart = header.textStart + header.text.indexOf(text);
          const addedParen = text.startsWith('(') ? 0 : 1;
          params.forEach((param) =>
            moveNodes(param, sourceStart - prefix.length - addedParen, (offset) =>
              this.locate(offset),
            ),
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
      this.closures.push({ node: arrow, callee, label, header, parameterText, async });
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
  parsers.set(language, TrailingParser);
  return TrailingParser;
}

export function parse(source, language = 'ts', sourceType = 'module') {
  const TrailingParser = parserFor(language);
  const parser = new TrailingParser({ ...options, sourceType, allowHashBang: true }, source);
  const ast = parser.parse();
  const live = new Set();
  const calls = [];
  const guards = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ArrowFunctionExpression') live.add(node);
    if (node.trailing) calls.push(node);
    if (node.type === 'GuardStatement') guards.push(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === 'trailing' || key === 'loc') continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value?.type) visit(value);
    }
  };
  visit(ast);
  return {
    ast,
    calls,
    guards,
    closures: parser.closures.filter((closure) => live.has(closure.node)),
  };
}
