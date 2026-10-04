import MagicString from 'magic-string';
import { Parser, tokTypes } from 'acorn';
import { parse } from './parser.js';
import { lowerDefers } from './defer';
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
  /** Standard JSX runtime source; normally inherited from tsconfig.json. */
  jsxImportSource?: string;
  /** Swift's single-expression implicit return. Defaults to true. */
  implicitReturn?: boolean;
}
export const extensions = ['.twill', '.twillx'] as const;
export function isTwillFile(id: string): boolean {
  return extensions.some((extension) => id.split(/[?#]/, 1)[0]!.endsWith(extension));
}
export function inferLanguage(filename: string): Language {
  if (/\.(?:twillx|tsx)$/.test(filename)) return 'tsx';
  if (/\.jsx$/.test(filename)) return 'jsx';
  if (/\.(?:js|mjs|cjs)$/.test(filename)) return 'js';
  return 'ts';
}

export class TwillSyntaxError extends SyntaxError {
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
    this.name = 'TwillSyntaxError';
    this.filename = filename;
    this.line = line;
    this.column = column;
    this.offset = error.pos ?? 0;
    this.frame = `${source.split(/\r?\n/)[line - 1] ?? ''}\n${' '.repeat(column)}^`;
  }
}

// The parser boundary uses ESTree, including TS/JSX nodes from Acorn plugins.
type Node = { type: string; start: number; end: number; [key: string]: any };
type ClosureMetadata = {
  node: Node;
  label: { start: number; end: number } | null;
  header: { end: number; inStart: number; asyncEnd: number | null; parenthesized: boolean } | null;
  async: boolean;
};
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
  const filename = options.filename ?? 'input.twill';
  let parsed: {
    ast: Node;
    calls: Node[];
    guards: Node[];
    defers: Node[];
    comments: { start: number; end: number; value: string; type: string }[];
    closures: ClosureMetadata[];
  };
  try {
    parsed = parse(
      source,
      options.language ?? inferLanguage(filename),
      options.sourceType ?? 'module',
    );
  } catch (error) {
    throw new TwillSyntaxError(
      source,
      filename,
      error as ConstructorParameters<typeof TwillSyntaxError>[2],
    );
  }
  const code = new MagicString(source);
  for (const guard of parsed.guards) {
    // A guard is one source statement. Without these braces an outer `else`
    // would bind to the lowered inner if (JavaScript's dangling-else rule).
    if (guard.singleStatement) {
      code.prependLeft(guard.start, '{');
      code.appendLeft(guard.end, '}');
    }
    if (guard.binding) {
      const binding = guard.binding.declarations[0].id;
      // Nullish checks preserve false, 0 and empty strings. The original
      // initializer runs once and the binding stays in the surrounding scope.
      code.remove(guard.start, guard.start + 'guard'.length);
      code.overwrite(
        guard.elseStart,
        guard.elseStart + 'else'.length,
        `; if (${binding.name} == null)`,
      );
    } else {
      code.overwrite(guard.start, guard.start + 'guard'.length, 'if (!(');
      code.overwrite(guard.elseStart, guard.elseStart + 'else'.length, '))');
    }
  }
  const uiFile = /\.twillx$/.test(filename.split(/[?#]/, 1)[0]!);
  const metadataByNode = new Map(parsed.closures.map((item) => [item.node, item]));
  const componentCalls = new Set(
    parsed.calls.filter((node) => {
      const name = calleeName(node.callee);
      // Like JSX tags, uppercase final names opt into component syntax in UI
      // files. Parenthesized callable expressions retain ordinary callback behavior.
      return (
        uiFile &&
        node.start === node.callee.start &&
        !!name &&
        /^[A-Z]/.test(name.split('.').at(-1)!)
      );
    }),
  );
  // TypeScript only reads file-level leading pragmas, and the last wins.
  const leadingComments = parsed.comments
    .filter((comment) => comment.start < (parsed.ast.body[0]?.start ?? source.length))
    .map((comment) => comment.value)
    .join('\n');
  const pragma = [...leadingComments.matchAll(/@jsxImportSource\s+(\S+)/g)].at(-1)?.[1];
  const imports = parsed.ast.body
    .filter((node: Node) => node.type === 'ImportDeclaration')
    .map((node: Node) => node.source.value as string);
  const vueImport = imports.some((name: string) => name === 'vue' || name.startsWith('@vue/'));
  const reactImport = imports.some((name: string) => name === 'react' || name.startsWith('react/'));
  if (componentCalls.size && !pragma && !options.jsxImportSource && vueImport && reactImport)
    throw new TwillSyntaxError(source, filename, {
      message:
        'Both React and Vue are imported. Select the standard JSX runtime with @jsxImportSource or tsconfig jsxImportSource.',
      pos: parsed.calls[0]!.start,
      loc: parsed.calls[0]!.loc.start,
    });
  const jsxImportSource = pragma ?? options.jsxImportSource ?? (vueImport ? 'vue' : 'react');
  const vue = jsxImportSource === 'vue';
  if (uiFile && !pragma && jsxImportSource !== 'react') {
    const start = source.startsWith('#!') ? source.indexOf('\n') + 1 : 0;
    code.appendLeft(start, `/** @jsxImportSource ${jsxImportSource} */\n`);
  }
  const attributeClosings: number[] = [];
  const componentProps: {
    start: number;
    end: number;
    properties: { name: string; start: number; end: number; shorthand: boolean }[];
  }[] = [];
  const stripPunctuation = (start: number, end: number, types: readonly unknown[]) => {
    const text = source.slice(start, end);
    const lexer = Parser.tokenizer(text, { ecmaVersion: 'latest' });
    const edits = new MagicString(text);
    for (let token = lexer.getToken(); token.type !== tokTypes.eof; token = lexer.getToken())
      if (types.includes(token.type)) edits.remove(token.start, token.end);
    return edits.toString();
  };
  let counter = 0;
  const usedNames = new Set<string>();
  if (componentCalls.size || parsed.defers.length)
    walk(parsed.ast, (node) => {
      if (node.type === 'Identifier') usedNames.add(node.name);
    });
  for (const node of parsed.calls) {
    const { callEnd, hadParens, originalArgs, closures } = node.trailing;
    const component = componentCalls.has(node);
    if (component) {
      if (
        originalArgs.length > 1 ||
        originalArgs[0]?.type === 'SpreadElement' ||
        node.optional ||
        node.callee.optional
      )
        throw new TwillSyntaxError(source, filename, {
          message:
            'Component syntax accepts one props object and children; optional calls use ordinary callbacks.',
          pos: node.start,
          loc: node.loc.start,
        });
      if (closures.length > 1 && !vue)
        throw new TwillSyntaxError(source, filename, {
          message:
            'React components accept one children closure. Supply render props in the props object.',
          pos: closures[1].start,
          loc: closures[1].loc.start,
        });
      if (vue) {
        const labels = new Set(['default']);
        for (const closure of closures.slice(1)) {
          const label = metadataByNode.get(closure)!.label!;
          const name = source.slice(label.start, label.end);
          if (labels.has(name))
            throw new TwillSyntaxError(source, filename, {
              message: `Duplicate Vue slot: ${name}`,
              pos: label.start,
              loc: closure.loc.start,
            });
          labels.add(name);
        }
      }
      const opening = vue ? '>{({default: ' : '>{(';
      const tagEnd = node.typeParameters?.end ?? node.callee.end;
      code.appendLeft(node.callee.start, '(<');
      const props = originalArgs[0] as Node | undefined;
      const directAttributes =
        !vue &&
        props?.type === 'ObjectExpression' &&
        props.properties.every(
          (property: Node) =>
            property.type === 'SpreadElement' ||
            (property.kind === 'init' &&
              !property.method &&
              !property.computed &&
              (property.key.name ?? property.key.value) !== '__proto__' &&
              /^[A-Za-z_$][\w$.:-]*$/.test(String(property.key.name ?? property.key.value))),
        );
      if (directAttributes) {
        componentProps.push({
          start: props!.start,
          end: props!.end,
          properties: props!.properties
            .filter((property: Node) => property.type !== 'SpreadElement')
            .map((property: Node) => ({
              name: String(property.key.name ?? property.key.value),
              start: property.key.start,
              end: property.key.end,
              shorthand: Boolean(property.shorthand),
            })),
        });
        // Literal props become native JSX attributes. This retains contextual
        // callback types and passes keys explicitly, as React's runtime expects.
        code.overwrite(
          tagEnd,
          props!.start + 1,
          ' ' + stripPunctuation(tagEnd, props!.start, [tokTypes.parenL]),
        );
        let previous = props!.start + 1;
        for (const property of props!.properties as Node[]) {
          if (previous < property.start)
            code.overwrite(
              previous,
              property.start,
              stripPunctuation(previous, property.start, [tokTypes.comma]) + ' ',
            );
          if (property.type === 'SpreadElement') code.prependLeft(property.start, '{');
          else {
            const name = String(property.key.name ?? property.key.value);
            if (property.shorthand) code.prependLeft(property.start, `${name}={`);
            else {
              code.overwrite(property.key.start, property.key.end, name);
              const start = property.key.end;
              const colon = Parser.tokenizer(source.slice(start, property.value.start), {
                ecmaVersion: 'latest',
              }).getToken();
              code.overwrite(start + colon.start, start + colon.end, '={');
            }
          }
          attributeClosings.push(property.end);
          previous = property.end;
        }
        const end = props!.end - 1;
        code.overwrite(
          previous,
          callEnd,
          stripPunctuation(previous, end, [tokTypes.comma]) +
            stripPunctuation(props!.end, callEnd, [tokTypes.parenR, tokTypes.comma]) +
            opening,
        );
      } else if (originalArgs.length) {
        const head = source.slice(tagEnd, originalArgs[0].start);
        const paren = Parser.tokenizer(head, { ecmaVersion: 'latest' }).getToken();
        code.overwrite(
          tagEnd,
          originalArgs[0].start,
          ' {...(' + head.slice(0, paren.start) + head.slice(paren.end),
        );
        const tailStart = originalArgs[0].end;
        const tail = Parser.tokenizer(source.slice(tailStart, callEnd - 1), {
          ecmaVersion: 'latest',
        });
        // Parenthesized props may contain closing parentheses before the comma.
        for (let token = tail.getToken(); token.type !== tokTypes.eof; token = tail.getToken())
          if (token.type === tokTypes.comma)
            code.remove(tailStart + token.start, tailStart + token.end);
        code.overwrite(callEnd - 1, callEnd, ')}' + opening);
      } else if (hadParens) {
        const gap = source.slice(tagEnd, callEnd);
        const tokens = Parser.tokenizer(gap, { ecmaVersion: 'latest' });
        const first = tokens.getToken();
        const last = tokens.getToken();
        code.overwrite(tagEnd, callEnd, opening + gap.slice(first.end, last.start));
      } else code.appendLeft(callEnd, opening);
    } else if (hadParens) {
      // Keep comments and trailing commas intact. The closing parenthesis is
      // moved after the closure; remove any comma immediately before it.
      const tailStart = originalArgs.at(-1)?.end ?? callEnd - 1;
      const tail = source.slice(tailStart, callEnd - 1);
      const token = Parser.tokenizer(tail, { ecmaVersion: 'latest' }).getToken();
      if (token.type === tokTypes.comma)
        code.remove(tailStart + token.start, tailStart + token.end);
      code.overwrite(callEnd - 1, callEnd, originalArgs.length ? ',' : '');
    } else code.appendLeft(callEnd, '(');
    let directChild = false;
    for (const closure of closures) {
      const metadata = metadataByNode.get(closure)!;
      const body = closure.body.body as Node[];
      const content = component && (vue || !metadata.header);
      const expressions = body.filter((statement) => statement.type === 'ExpressionStatement');
      const singleContent =
        content &&
        expressions.length === 1 &&
        body.every((statement) =>
          [
            'ExpressionStatement',
            'VariableDeclaration',
            'FunctionDeclaration',
            'ClassDeclaration',
            'DeferStatement',
            'EmptyStatement',
          ].includes(statement.type),
        ) &&
        body.filter((statement) => statement.type !== 'EmptyStatement').at(-1) === expressions[0];
      if (singleContent && body.length === 1 && !vue) {
        // A single JSX child is a value, not an array or an eagerly invoked
        // callback. This also supports libraries requiring ReactElement children.
        directChild = true;
        code.remove(closure.start, closure.start + 1);
        code.remove(closure.end - 1, closure.end);
        const statement = expressions[0]!;
        if (source[statement.end - 1] === ';') code.remove(statement.end - 1, statement.end);
        continue;
      }
      if (metadata.label) {
        const label = source
          .slice(metadata.label.start, metadata.label.end)
          .replace(/\s*:\s*$/, '');
        code.overwrite(
          metadata.label.start,
          closure.start,
          component && vue ? `, [${JSON.stringify(label)}]: ` : ', ',
        );
      }
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
      if (content && !singleContent) {
        let collector: string;
        do collector = `__twillChildren${counter++}`;
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
            case 'GuardStatement':
              collect(statement.failure);
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
              throw new TwillSyntaxError(source, filename, {
                message:
                  'Component children collect expressions; use expressions instead of return.',
                pos: statement.start,
                loc: statement.loc.start,
              });
            // Declarations, break/continue, throw, functions and classes keep
            // their normal semantics. Never collect inside a nested function.
          }
        };
        body.forEach(collect);
        code.prependLeft(
          closure.end - 1,
          vue
            ? `;return ${collector};`
            : `;return ${collector}.length === 1 ? ${collector}[0] : ${collector};`,
        );
      } else if (
        singleContent ||
        (options.implicitReturn !== false &&
          body.length === 1 &&
          body[0]!.type === 'ExpressionStatement')
      ) {
        // Parentheses prevent object literals / comma expressions from changing meaning.
        const statement = singleContent ? expressions[0]! : body[0]!;
        code.prependLeft(statement.start, 'return (');
        code.appendLeft(source[statement.end - 1] === ';' ? statement.end - 1 : statement.end, ')');
      }
    }
    if (component)
      code.prependLeft(
        closures.at(-1).end,
        (vue ? '})}' : directChild || metadataByNode.get(closures[0])!.header ? ')}' : ')()}') +
          `</${calleeName(node.callee)}>)`,
      );
    else code.appendLeft(closures.at(-1).end, ')');
    // The parser may visit nested trailing calls after this one. Edits use
    // original offsets throughout, so nested scopes compose without reparsing.
  }
  // Apply outer attribute braces after nested call suffixes at the same offset.
  for (const end of attributeClosings) code.appendLeft(end, '}');
  if (parsed.defers.length) {
    const starts = new Map<Node, number>();
    for (const metadata of parsed.closures)
      if (metadata.header) starts.set(metadata.node.body, metadata.header.end);
    lowerDefers(
      source,
      parsed.ast,
      code,
      options.language ?? inferLanguage(filename),
      usedNames,
      starts,
      parsed.comments,
      (node, message) => {
        throw new TwillSyntaxError(source, filename, {
          message,
          pos: node.start,
          loc: node.loc.start,
        });
      },
    );
  }
  const map = code.generateMap({
    source: filename,
    file: filename.replace(/\.twillx?$/, '.js'),
    includeContent: true,
    hires: true,
  });
  return {
    code: code.toString(),
    map,
    changed: code.hasChanged(),
    closures: parsed.closures.length,
    guards: parsed.guards.length,
    defers: parsed.defers.length,
    componentProps,
  };
}

export type TransformResult = ReturnType<typeof transform>;
const traceMaps = new WeakMap<TransformResult, TraceMap>();
function traceMap(result: TransformResult): TraceMap {
  let map = traceMaps.get(result);
  if (!map) {
    map = new TraceMap(result.map as any);
    traceMaps.set(result, map);
  }
  return map;
}
export function originalPosition(result: TransformResult, line: number, column: number) {
  return originalPositionFor(traceMap(result), {
    line,
    column,
    bias: GREATEST_LOWER_BOUND,
  });
}
export function generatedPosition(result: TransformResult, line: number, column: number) {
  return generatedPositionFor(traceMap(result), {
    source: result.map.sources[0]!,
    line,
    column,
    bias: GREATEST_LOWER_BOUND,
  });
}
