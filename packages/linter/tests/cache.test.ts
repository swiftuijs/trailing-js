import { afterEach, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { mkdtempSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import plugin, { disposeProjects } from '../src/index.twill';
const roots: string[] = [];
afterEach(() => {
  disposeProjects();
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'twill-lint-cache-'));
  roots.push(root);
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
      include: ['*'],
    }),
  );
  const source = 'import {value} from "./api"; export const selected=[value].filter { .active };';
  const file = join(root, 'main.twill');
  writeFileSync(file, source);
  writeFileSync(join(root, 'api.ts'), 'export const value:{active:boolean}={active:true};');
  const engine = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: plugin.configs.recommendedTypeChecked,
  });
  return { root, source, file, engine };
}
it('refreshes disk types and inherited configuration without leaking unsaved lint buffers', async () => {
  const { root, source, file, engine } = fixture();
  expect((await engine.lintText(source, { filePath: file }))[0]!.messages).toEqual([]);
  writeFileSync(join(root, 'api.ts'), 'export const value:any={active:true};');
  utimesSync(join(root, 'api.ts'), new Date(), new Date(Date.now() + 2000));
  const changed = (await engine.lintText(source, { filePath: file }))[0]!;
  expect(changed.messages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        ruleId: '@typescript-eslint/no-unsafe-member-access',
        column: source.indexOf('active') + 1,
      }),
    ]),
  );
  writeFileSync(join(root, 'api.ts'), 'export const value:{active:boolean}={active:true};');
  utimesSync(join(root, 'api.ts'), new Date(), new Date(Date.now() + 4000));
  writeFileSync(join(root, 'twill.config.json'), '{"implicitReturn":true}');
  expect((await engine.lintText(source, { filePath: file }))[0]!.messages).toEqual([]);
  const unsaved = source.replace('{ .active }', '{ Promise.resolve(.active); return .active; }');
  expect((await engine.lintText(unsaved, { filePath: file }))[0]!.messages.length).toBeGreaterThan(
    0,
  );
  expect((await engine.lintText(source, { filePath: file }))[0]!.messages).toEqual([]);
});
it('bounds cached projects and recreates an evicted project with current disk types', async () => {
  const projects = Array.from({ length: 9 }, () => fixture());
  for (const { source, file, engine } of projects)
    expect((await engine.lintText(source, { filePath: file }))[0]!.messages).toEqual([]);
  const first = projects[0]!;
  writeFileSync(join(first.root, 'api.ts'), 'export const value:any={active:true};');
  expect(
    (await first.engine.lintText(first.source, { filePath: first.file }))[0]!.messages.map(
      (item) => item.ruleId,
    ),
  ).toContain('@typescript-eslint/no-unsafe-member-access');
});
it('reports a useful setup error when type-aware linting has no tsconfig', async () => {
  const root = mkdtempSync(join(tmpdir(), 'twill-lint-no-config-'));
  roots.push(root);
  const engine = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: plugin.configs.recommendedTypeChecked,
  });
  const result = (
    await engine.lintText('export const value=1;', { filePath: join(root, 'main.twill') })
  )[0]!;
  expect(result.messages[0]).toMatchObject({
    fatal: true,
    message: expect.stringContaining('requires a tsconfig.json'),
  });
});
