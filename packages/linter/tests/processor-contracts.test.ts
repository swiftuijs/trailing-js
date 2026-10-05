import { afterEach, expect, it } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { processors, configs, disposeProjects } from '../src/index';
import type { Linter } from 'eslint';

const roots: string[] = [];
afterEach(() => {
  disposeProjects();
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});
const processor = processors.twill!;
function prepare(source: string, filename = 'contracts.twill') {
  const root = mkdtempSync(join(tmpdir(), 'lint-processor-contract-'));
  roots.push(root);
  const file = join(root, filename);
  if (filename.endsWith('.twillx'))
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { jsxImportSource: 'vue' } }),
    );
  const blocks = processor.preprocess!(source, file) as { text: string; filename: string }[];
  return {
    root,
    file,
    blocks,
    finish: (messages: Linter.LintMessage[]) => processor.postprocess!([messages], file),
  };
}
function at(text: string, offset: number) {
  const lines = text.slice(0, offset).split('\n');
  return { line: lines.length, column: lines.at(-1)!.length + 1 };
}
it('preserves file-level rule messages without positions', () => {
  const { finish } = prepare('export const value=1;');
  const message = {
    ruleId: 'file-policy',
    severity: 1,
    message: 'Whole file warning',
  } as Linter.LintMessage;
  expect(finish([message])).toEqual([message]);
});
it('suppresses unmapped generated pragmas and diagnostics on empty output', () => {
  for (const [source, name] of [
    ['declare const Card:any;const view=Card { "child" };', 'view.twillx'],
    ['', 'empty.twill'],
  ]) {
    const { blocks, finish } = prepare(source!, name);
    const location = at(blocks[0]!.text, source ? blocks[0]!.text.indexOf('@jsxImportSource') : 0);
    expect(
      finish([{ ruleId: 'generated-only', severity: 2, message: 'hidden', ...location }]),
    ).toEqual([]);
  }
});
it('keeps a source diagnostic while withholding unmapped suggestions and absent end coordinates', () => {
  const source = 'declare const Card:any; const view=Card { "child" };';
  const { blocks, finish } = prepare(source, 'view.twillx');
  const code = blocks[0]!.text;
  const offset = code.indexOf('view');
  const message: Linter.LintMessage = {
    ruleId: 'suggestion-contract',
    severity: 1,
    message: 'rename',
    ...at(code, offset),
    suggestions: [
      { desc: 'safe', messageId: 'safe', fix: { range: [offset, offset + 4], text: 'renamed' } },
      {
        desc: 'hidden pragma',
        messageId: 'hidden',
        fix: {
          range: [code.indexOf('@jsxImportSource'), code.indexOf('@jsxImportSource') + 1],
          text: 'unsafe',
        },
      },
    ],
  };
  const [result] = finish([message]);
  expect(result).toMatchObject({
    line: 1,
    column: source.indexOf('view') + 1,
    endLine: undefined,
    endColumn: undefined,
    fix: undefined,
  });
  expect(result!.suggestions).toEqual([
    {
      desc: 'safe',
      messageId: 'safe',
      fix: { range: [source.indexOf('view'), source.indexOf('view') + 4], text: 'renamed' },
    },
  ]);
});
it('reports non-parser setup failures at a usable default location', () => {
  const root = mkdtempSync(join(tmpdir(), 'lint-invalid-config-'));
  roots.push(root);
  writeFileSync(join(root, 'twill.config.json'), '{"implicitReturn":"invalid"}');
  const file = join(root, 'main.twill');
  expect(processor.preprocess!('export const value=1;', file)).toEqual([]);
  expect(processor.postprocess!([], file)).toEqual([
    expect.objectContaining({
      fatal: true,
      line: 1,
      column: 1,
      message: expect.stringContaining('implicitReturn'),
    }),
  ]);
});
it('delegates native parser requests without a processor state or file path', () => {
  const parser = configs.recommended!.find((config) => config.languageOptions?.parser)
    ?.languageOptions?.parser as {
    parseForESLint: typeof import('@typescript-eslint/parser').parseForESLint;
  };
  const result = parser.parseForESLint('const value:number=1;', {
    sourceType: 'module',
    ecmaVersion: 2022,
  });
  expect(result.ast.body[0]!.type).toBe('VariableDeclaration');
});
