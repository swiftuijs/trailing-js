import MagicString from 'magic-string';
import { Parser, tokTypes } from 'acorn';
import { parse } from './parser.js';
import {
  originalPositionFor,
  generatedPositionFor,
  TraceMap,
  GREATEST_LOWER_BOUND,
} from '@jridgewell/trace-mapping';

export type Language = 'js' | 'jsx' | 'ts' | 'tsx';
export interface TransformOptions {
  filename?: string;
  language?: Language;
  sourceType?: 'module' | 'script';
  /** Explicit callee names whose closures collect expression statements as children. */
  builders?: string[];
  /** Swift's single-expression implicit return. Defaults to true. */
  implicitReturn?: boolean;
}
export const extensions = ['.tjs', '.tts', '.tjsx', '.ttsx'] as const;
export function isTrailingFile(id: string): boolean {
  return extensions.some((extension) => id.split(/[?#]/, 1)[0]!.endsWith(extension));
}
export function inferLanguage(filename: string): Language {
  if (/\.(?:ttsx|tsx)$/.test(filename)) return 'tsx';
  if (/\.(?:tjsx|jsx)$/.test(filename)) return 'jsx';
  if (/\.(?:tjs|js|mjs|cjs)$/.test(filename)) return 'js';
  return 'ts';
}

export class TrailingSyntaxError extends SyntaxError {
  readonly filename: string;
  readonly line: number;
  readonly column: number;
  readonly offset: number;
  readonly frame: string;
  constructor(
    source: string,
    filename: string,
    error: { message: string; pos?: number; loc?: { line: number; column: number } },
  ) {
    const line = error.loc?.line ?? 1;
    const column = error.loc?.column ?? 0;
    super(`${filename}:${line}:${column + 1}: ${error.message.replace(/\s*\(\d+:\d+\)$/, '')}`);
    this.name = 'TrailingSyntaxError';
    this.filename = filename;
    this.line = line;
    this.column = column;
    this.offset = error.pos ?? 0;
    this.frame = `${source.split(/\r?\n/)[line - 1] ?? ''}\n${' '.repeat(column)}^`;
  }
}

// The parser boundary uses ESTree, including TS/JSX nodes from Acorn plugins.
type Node = { type: string; start: number; end: number; [key: string]: any };
function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'trailing'].includes(key)) continue;
    if (Array.isArray(value))
      value.forEach((child) => {
        if (child?.type) walk(child, visit);
      });
    else if (value?.type) walk(value, visit);
  }
}
function calleeName(node: Node): string | undefined {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed) {
    const object = calleeName(node.object);
    if (object) return `${object}.${node.property.name}`;
  }
}

export function transform(source: string, options: TransformOptions = {}) {
  const filename = options.filename ?? 'input.tts';
  let parsed;
  try {
    parsed = parse(
      source,
      options.language ?? inferLanguage(filename),
      options.sourceType ?? 'module',
    );
  } catch (error) {
    throw new TrailingSyntaxError(
      source,
      filename,
      error as ConstructorParameters<typeof TrailingSyntaxError>[2],
    );
  }
  const code = new MagicString(source);
  const builders = new Set(options.builders ?? []);
  const metadataByNode = new Map(parsed.closures.map((item) => [item.node, item]));
  let counter = 0;
  const usedNames = new Set<string>();
  walk(parsed.ast, (node) => {
    if (node.type === 'Identifier') usedNames.add(node.name);
  });
  walk(parsed.ast, (node) => {
    if (!node.trailing) return;
    const { callEnd, hadParens, originalArgs, closures } = node.trailing;
    if (hadParens) {
      // Keep comments and trailing commas intact. The closing parenthesis is
      // moved after the closure; remove any comma immediately before it.
      const tailStart = originalArgs.at(-1)?.end ?? callEnd - 1;
      const tail = source.slice(tailStart, callEnd - 1);
      const token = Parser.tokenizer(tail, { ecmaVersion: 'latest' }).getToken();
      if (token.type === tokTypes.comma)
        code.remove(tailStart + token.start, tailStart + token.end);
      code.overwrite(callEnd - 1, callEnd, originalArgs.length ? ',' : '');
    } else code.appendLeft(callEnd, '(');
    for (const closure of closures) {
      const metadata = metadataByNode.get(closure)!;
      if (metadata.label) code.overwrite(metadata.label.start, closure.start, ', ');
      if (metadata.header) {
        const header = metadata.header;
        // Preserve parameter tokens in place so types, hover and diagnostics map
        // to their original locations instead of a regenerated header string.
        code.overwrite(
          closure.start,
          closure.start + 1,
          header.parenthesized || metadata.async ? '' : '(',
        );
        if (metadata.async && !header.parenthesized) code.appendLeft(header.asyncEnd!, ' (');
        code.overwrite(header.inStart, header.end, `${header.parenthesized ? '' : ') '}=> {`);
      } else code.overwrite(closure.start, closure.start + 1, '() => {');
      const body = closure.body.body as Node[];
      if (builders.has(calleeName(node.callee) ?? '')) {
        let collector: string;
        do collector = `__trailingChildren${counter++}`;
        while (usedNames.has(collector));
        const bodyStart = metadata.header?.end ?? closure.start + 1;
        code.appendLeft(bodyStart, `const ${collector} = [];`);
        const collect = (statement: Node): void => {
          switch (statement.type) {
            case 'ExpressionStatement':
              code.prependLeft(statement.start, `${collector}.push(`);
              code.appendLeft(
                source[statement.end - 1] === ';' ? statement.end - 1 : statement.end,
                ')',
              );
              break;
            case 'BlockStatement':
              statement.body.forEach(collect);
              break;
            case 'IfStatement':
              collect(statement.consequent);
              if (statement.alternate) collect(statement.alternate);
              break;
            case 'ForStatement':
            case 'ForOfStatement':
            case 'ForInStatement':
            case 'WhileStatement':
            case 'DoWhileStatement':
              collect(statement.body);
              break;
            case 'SwitchStatement':
              statement.cases.forEach((branch: Node) => branch.consequent.forEach(collect));
              break;
            case 'TryStatement':
              collect(statement.block);
              if (statement.handler) collect(statement.handler.body);
              if (statement.finalizer) collect(statement.finalizer);
              break;
            case 'LabeledStatement':
              collect(statement.body);
              break;
            case 'ReturnStatement':
              throw new TrailingSyntaxError(source, filename, {
                message: 'Builder closures collect expressions; use expressions instead of return.',
                pos: statement.start,
                loc: statement.loc.start,
              });
            // Declarations, break/continue, throw, functions and classes keep
            // their normal semantics. Never collect inside a nested function.
          }
        };
        body.forEach(collect);
        code.prependLeft(closure.end - 1, `;return ${collector};`);
      } else if (
        options.implicitReturn !== false &&
        body.length === 1 &&
        body[0]!.type === 'ExpressionStatement'
      ) {
        // Parentheses prevent object literals / comma expressions from changing meaning.
        const statement = body[0]!;
        code.prependLeft(statement.start, 'return (');
        code.appendLeft(source[statement.end - 1] === ';' ? statement.end - 1 : statement.end, ')');
      }
    }
    code.appendLeft(closures.at(-1).end, ')');
    // The parser may visit nested trailing calls after this one. Edits use
    // original offsets throughout, so nested scopes compose without reparsing.
  });
  const map = code.generateMap({
    source: filename,
    file: filename.replace(/\.(tts|tjs|ttsx|tjsx)$/, '.js'),
    includeContent: true,
    hires: true,
  });
  return {
    code: code.toString(),
    map,
    changed: parsed.closures.length > 0,
    closures: parsed.closures.length,
  };
}

export type TransformResult = ReturnType<typeof transform>;
export function originalPosition(result: TransformResult, line: number, column: number) {
  return originalPositionFor(new TraceMap(result.map as any), {
    line,
    column,
    bias: GREATEST_LOWER_BOUND,
  });
}
export function generatedPosition(result: TransformResult, line: number, column: number) {
  return generatedPositionFor(new TraceMap(result.map as any), {
    source: result.map.sources[0]!,
    line,
    column,
    bias: GREATEST_LOWER_BOUND,
  });
}
