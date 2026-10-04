import { afterEach, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import twill, { disposeProjects } from '@swiftuijs/twill-linter';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

afterEach(disposeProjects);
describe('ESLint Twill processor', () => {
  const engine = (extra: any = {}, fix = false) =>
    new ESLint({
      overrideConfigFile: true,
      overrideConfig: [...twill.configs.recommended!, { files: ['**/*.ts'], ...extra }],
      fix,
    });
  it.each(['\n', '\r\n', '\u2028'])('maps original ranges across %j', async (newline) => {
    const source = `export const result = [1].map { n in n*2 };${newline}const unused = 1;`;
    const [result] = await engine().lintText(source, { filePath: 'fixture.twill' });
    expect(
      result!.messages.find((message) => message.ruleId === '@typescript-eslint/no-unused-vars'),
    ).toMatchObject({ ruleId: '@typescript-eslint/no-unused-vars', line: 2, column: 7 });
  });
  it('applies only source-preserving fixes without lowering the dialect', async () => {
    const source = 'export const result=[1].map { n in let value=n*2; return value; };';
    const [result] = await engine({ rules: { 'prefer-const': 'error' } }, true).lintText(source, {
      filePath: 'fix.twill',
    });
    expect(result!.output).toContain('map { n in const value=');
    expect(result!.messages).toEqual([]);
  });
  it('reports original syntax errors and suppresses generated-helper lint', async () => {
    const [broken] = await engine().lintText('fn {', { filePath: 'broken.twill' });
    expect(broken!.messages[0]).toMatchObject({ fatal: true, severity: 2, line: 1 });
    const [valid] = await engine().lintText('export function run(){defer {};return 1;}', {
      filePath: 'cleanup.twill',
    });
    expect(valid!.messages).toEqual([]);
  });
  it('supports type-aware rules against the virtual TypeScript program', async () => {
    const root = mkdtempSync(join(tmpdir(), 'twill-lint-'));
    try {
      writeFileSync(
        join(root, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            types: [],
          },
          include: ['**/*'],
        }),
      );
      const source = 'export const result=[1].map { n in Promise.resolve(n); n*2 };';
      writeFileSync(join(root, 'main.twill'), source);
      const eslint = new ESLint({
        overrideConfigFile: true,
        cwd: root,
        overrideConfig: twill.configs.recommendedTypeChecked,
      });
      const [result] = await eslint.lintText(source, { filePath: join(root, 'main.twill') });
      expect(
        result!.messages.some(
          (message) =>
            message.ruleId === '@typescript-eslint/no-floating-promises' &&
            message.column === source.indexOf('Promise') + 1,
        ),
      ).toBe(true);
    } finally {
      disposeProjects();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
