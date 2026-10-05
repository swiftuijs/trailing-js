import * as doc from 'prettier/doc';
import * as estree from 'prettier/plugins/estree';
import { parse } from './parser.js';
import type { Plugin, Printer, ParserOptions, Doc } from 'prettier';

type Node = { type: string; start: number; end: number; [key: string]: any };
const { group, join, indent, hardline } = doc.builders;
const standard = estree.printers.estree as Printer<any>;
const keys: Record<string, string[]> = {
  TwillCall: ['call', 'closures'],
  TwillBareCall: ['callee', 'typeArguments'],
  TwillClosure: ['params', 'returnType', 'body'],
  TwillParenthesized: ['expression'],
  GuardStatement: ['binding', 'test', 'failure'],
  TwillGuardBinding: ['declarations'],
  DeferStatement: ['cleanup'],
  TwillSwitchExpression: ['discriminant', 'cases'],
  TwillSwitchCase: ['test', 'pattern', 'value'],
};

const printer: Printer<any> = {
  ...standard,
  getVisitorKeys(node, excluded) {
    return keys[node.type] ?? standard.getVisitorKeys!(node, excluded);
  },
  print(path, options, print, args) {
    const node = path.node;
    switch (node.type) {
      case 'ExpressionStatement': {
        const printed = standard.print(path, options, print, args);
        let left = node.expression;
        while (left && left.type !== 'TwillCall')
          left = left.object ?? left.callee ?? left.tag ?? left.left ?? left.test;
        // Prettier's native ASI detector cannot descend into custom call
        // nodes. Keep hazardous parenthesized/array callees independent of
        // the previous statement when semicolons are disabled.
        const first = options.originalText.slice(node.start).trimStart()[0];
        return !options.semi && left && first && '([`+-/'.includes(first)
          ? [';', printed]
          : printed;
      }
      case 'TwillSwitchExpression':
        return group([
          'switch (',
          path.call(print, 'discriminant'),
          ') {',
          indent([hardline, join(hardline, path.map(print, 'cases'))]),
          hardline,
          '}',
        ]);
      case 'TwillSwitchCase':
        return [
          'test' in node && node.test === null && !node.pattern
            ? 'default'
            : ['case ', path.call(print, node.pattern ? 'pattern' : 'test')],
          ': ',
          node.throw ? 'throw ' : '',
          path.call(print, 'value'),
          options.semi ? ';' : '',
        ];
      case 'TwillParenthesized':
        return ['(', path.call(print, 'expression'), ')'];
      case 'TwillBareCall':
        return [
          path.call(print, 'callee'),
          node.typeArguments ? path.call(print, 'typeArguments') : '',
        ];
      case 'TwillCall':
        return group([path.call(print, 'call'), ' ', join(' ', path.map(print, 'closures'))]);
      case 'TwillClosure': {
        let block = path.call(print, 'body');
        if (node.header) {
          const params = join(', ', path.map(print, 'params'));
          const header: Doc = [
            node.async ? 'async ' : '',
            node.header.parenthesized ? ['(', params, ')'] : params,
            node.returnType ? path.call(print, 'returnType') : '',
            ' in',
          ];
          let inserted = false;
          // Walk in print order without mapDoc's primitive-string cache:
          // changing its first "{" would also change every nested "{".
          const inject = (part: Doc): Doc => {
            if (inserted) return part;
            if (part === '{') {
              inserted = true;
              return ['{', ' ', header, node.body.body.length ? '' : ' '];
            }
            if (Array.isArray(part)) return part.map(inject);
            if (part && typeof part === 'object' && 'contents' in part)
              return { ...part, contents: inject(part.contents) };
            return part;
          };
          block = inject(block);
        }
        return [node.label ? `${node.label}: ` : '', block];
      }
      case 'TwillGuardBinding':
        return ['const ', join(', ', path.map(print, 'declarations'))];
      case 'GuardStatement':
        return group([
          'guard ',
          path.call(print, node.binding ? 'binding' : 'test'),
          ' else ',
          path.call(print, 'failure'),
        ]);
      case 'DeferStatement':
        return ['defer ', path.call(print, 'cleanup', 'body')];
      default:
        return standard.print(path, options, print, args);
    }
  },
};

export const plugin: Plugin<any> = {
  languages: [
    {
      name: 'Twill',
      parsers: ['twill'],
      extensions: ['.twill', '.twillx'],
      vscodeLanguageIds: ['twill-typescript', 'twill-tsx'],
    },
  ],
  parsers: {
    twill: {
      parse,
      astFormat: 'twill-estree',
      locStart: (node) => node.start,
      locEnd: (node) => node.end,
    },
  },
  printers: { 'twill-estree': printer },
};

export default plugin;
