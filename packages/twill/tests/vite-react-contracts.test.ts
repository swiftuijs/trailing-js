import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import twillReact from '../src/vite-react';
import type { Plugin } from 'vite';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
it('rejects a classic JSX runtime before creating build plugins', () => {
  expect(() => twillReact({ react: { jsxRuntime: 'classic' } })).toThrow('automatic JSX runtime');
});
it.each([
  [{ twill: { jsxImportSource: 'preact' } }, 'preact'],
  [{ twill: { jsxImportSource: 'vue' }, react: { jsxImportSource: 'preact' } }, 'preact'],
])(
  'honors explicit JSX runtime overrides consistently in the compiler and React plugin',
  async (options, source) => {
    const root = mkdtempSync(join(tmpdir(), 'twill-react-runtime-'));
    roots.push(root);
    const [compiler] = twillReact({ ...options, twill: { ...options.twill, root } }) as Plugin[];
    const transform = compiler!.transform!;
    const handler = typeof transform === 'function' ? transform : transform.handler;
    const result = await handler.call(
      { addWatchFile() {} } as any,
      'const Card="article"; export const view=Card { "child" };',
      join(root, 'view.twillx'),
    );
    expect(result && typeof result === 'object' && result.code).toContain(source + '/jsx-runtime');
  },
);
