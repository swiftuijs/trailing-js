import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, configurationFiles } from '../packages/twill/src/config';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
it('tracks inherited and missing tsconfig files, then refreshes when they appear or disappear', () => {
  const root = mkdtempSync(join(tmpdir(), 'twill-config-'));
  roots.push(root);
  const parent = join(root, 'parent.json');
  writeFileSync(join(root, 'tsconfig.json'), '{ "extends": "./parent.json" }');
  expect(loadConfig(root).jsxImportSource).toBeUndefined();
  expect(configurationFiles(root)).toEqual(
    expect.arrayContaining([parent, join(root, 'twill.config.json')]),
  );
  writeFileSync(parent, '{ "compilerOptions": { "jsxImportSource": "vue" } }');
  expect(loadConfig(root).jsxImportSource).toBe('vue');
  rmSync(parent);
  expect(loadConfig(root).jsxImportSource).toBeUndefined();
});
