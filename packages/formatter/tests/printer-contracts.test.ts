import { expect, it } from 'vitest';
import { doc } from 'prettier';
import { plugin } from '../src/plugin';
import { parse } from '../src/parser';
import type { AstPath, Doc, ParserOptions } from 'prettier';

it('prints a typed closure with an empty body and retains document commands before its block', () => {
  const node = {
    type: 'TwillClosure',
    header: { parenthesized: false },
    params: [{ type: 'Identifier', name: 'value' }],
    body: { body: [] },
    async: false,
    label: 'done',
  };
  const block: Doc = doc.builders.group(['/* before */', doc.builders.hardline, '{', '}']);
  const path = { node, call: () => block, map: () => ['value'] } as unknown as AstPath<any>;
  const printed = plugin.printers!['twill-estree']!.print(
    path,
    {} as ParserOptions,
    () => '',
    undefined,
  );
  const output = doc.printer.printDocToString(printed, {
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
  }).formatted;
  expect(output).toBe('done: /* before */\n{ value in }');
  expect(
    doc.printer.printDocToString(block, { printWidth: 80, tabWidth: 2, useTabs: false }).formatted,
  ).toBe('/* before */\n{}');
});
it('parses an empty file and preserves comment-only offsets through the public parser contract', async () => {
  for (const source of ['', '/* standalone comment */']) {
    const ast = await parse(source, { filepath: 'empty.twill' } as ParserOptions);
    expect(ast.range).toEqual([0, source.length]);
    expect(ast.body).toEqual([]);
    if (source)
      expect(ast.comments).toEqual([expect.objectContaining({ range: [0, source.length] })]);
  }
});
