import { fixtureRoot } from './helpers/fixture.js';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';
import { rollup } from 'rollup';
import { build as vite, createServer } from 'vite';
import esbuildPlugin from '../src/esbuild';
import rollupPlugin from '../src/rollup';
import vitePlugin from '../src/vite';
import twillReact from '../src/vite-react';
import webpack from 'webpack';
import { rspack } from '@rspack/core';
import webpackPlugin from '../src/webpack';
import rspackPlugin from '../src/rspack';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = fixtureRoot('.twill-build-');
  roots.push(root);
  writeFileSync(join(root, 'numbers.ts'), 'export const values: number[] = [1,2,3];');
  writeFileSync(join(root, 'offset.js'), 'export const offset = 0;');
  writeFileSync(join(root, 'types.ts'), 'export interface Value { amount: number }');
  writeFileSync(
    join(root, 'double.twill'),
    'import {offset} from "./offset.js"; export function double(x: number) { guard x > 0 else { return 0; } let result = x * 2 + offset; defer { result = 0; } return result; }',
  );
  writeFileSync(
    join(root, 'main.twill'),
    'import {values} from "./numbers"; import {double} from "./double"; import type {Value} from "./types.ts"; export const result = values.map() { (x: number) in defer {} guard x > 0 else { throw new Error(); } const value: Value = {amount: double(x)}; return value.amount; };',
  );
  writeFileSync(
    join(root, 'ui.twillx'),
    'function Card(props: {children?: import("react").ReactNode}) { return <article>{props.children}</article>; } export const view = Card { [1,2].map { value in <span key={value}>{value}</span> }; };',
  );
  writeFileSync(join(root, 'consumer.js'), 'export {result} from "./main.twill";');
  writeFileSync(
    join(root, 'entry.ts'),
    'import {result as numbers} from "./consumer.js"; export const result: number[] = numbers; export {view} from "./ui.twillx";',
  );
  return root;
}

it('inherits the standard JSX runtime for Twill and native files in the React adapter', async () => {
  const root = fixture();
  writeFileSync(
    join(root, 'tsconfig.json'),
    '{"compilerOptions":{"jsx":"react-jsx","jsxImportSource":"custom"}}',
  );
  writeFileSync(
    join(root, 'runtime.ts'),
    'export const jsx = (type: unknown, props: unknown) => ({ type, props, runtime: "custom" }); export const jsxs = jsx;',
  );
  // The component value need not execute: both views are plain runtime records.
  writeFileSync(
    join(root, 'custom.tsx'),
    'const Card = "article"; export const native = <Card>child</Card>;',
  );
  writeFileSync(
    join(root, 'custom.twillx'),
    'const Card = "article"; export const dialect = Card { "child"; };',
  );
  const server = await createServer({
    root,
    configFile: false,
    plugins: twillReact({ twill: { root } }),
    resolve: {
      alias: {
        'custom/jsx-runtime': join(root, 'runtime.ts'),
        'custom/jsx-dev-runtime': join(root, 'runtime.ts'),
      },
    },
    server: { middlewareMode: true },
  });
  try {
    const dialect = await server.ssrLoadModule('/custom.twillx');
    const native = await server.ssrLoadModule('/custom.tsx');
    expect(dialect.dialect).toEqual(native.native);
    expect(dialect.dialect.runtime).toBe('custom');
  } finally {
    await server.close();
  }
});

describe('real build tools', () => {
  it('bundles TypeScript and extensionless imports with esbuild', async () => {
    const root = fixture();
    const result = await esbuild({
      entryPoints: [join(root, 'entry.ts')],
      bundle: true,
      format: 'cjs',
      write: false,
      sourcemap: 'inline',
      plugins: [esbuildPlugin({ root })],
    });
    const module = { exports: {} as { result: number[]; view: ReactNode } };
    Function('module', 'exports', result.outputFiles![0]!.text)(module, module.exports);
    expect(module.exports.result).toEqual([2, 4, 6]);
    expect(renderToStaticMarkup(module.exports.view)).toBe(
      '<article><span>1</span><span>2</span></article>',
    );
    expect(result.outputFiles![0]!.text).toContain('sourceMappingURL=data:');
  });
  it('bundles with Rollup and preserves original sources in maps', async () => {
    const root = fixture();
    const bundle = await rollup({
      input: join(root, 'entry.ts'),
      plugins: [rollupPlugin({ root })],
      external: ['react/jsx-runtime'],
    });
    try {
      const { output } = await bundle.generate({ format: 'cjs', sourcemap: true });
      const chunk = output[0]!;
      if (chunk.type !== 'chunk') throw new Error('Expected chunk');
      const exports = {} as { result: number[]; view: ReactNode };
      Function('exports', 'require', chunk.code)(exports, createRequire(import.meta.url));
      expect(exports.result).toEqual([2, 4, 6]);
      expect(renderToStaticMarkup(exports.view)).toBe(
        '<article><span>1</span><span>2</span></article>',
      );
      expect(chunk.map?.sources.map((source) => source.split('/').at(-1))).toEqual(
        expect.arrayContaining(['main.twill', 'numbers.ts', 'ui.twillx']),
      );
    } finally {
      await bundle.close();
    }
  });
  it('builds and loads modules in Vite dev SSR', async () => {
    const root = fixture();
    const server = await createServer({
      root,
      configFile: false,
      plugins: [vitePlugin({ root })],
      server: { middlewareMode: true },
    });
    try {
      const loaded = await server.ssrLoadModule('/entry.ts');
      expect(loaded.result).toEqual([2, 4, 6]);
      expect(renderToStaticMarkup(loaded.view)).toBe(
        '<article><span>1</span><span>2</span></article>',
      );
    } finally {
      await server.close();
    }
    await vite({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [vitePlugin({ root })],
      build: {
        outDir: join(root, 'dist'),
        lib: { entry: join(root, 'entry.ts'), formats: ['es'], fileName: () => 'main.mjs' },
        sourcemap: true,
      },
    });
    const module = await import(pathToFileURL(join(root, 'dist', 'main.mjs')).href);
    expect(module.result).toEqual([2, 4, 6]);
    expect(renderToStaticMarkup(module.view)).toBe(
      '<article><span>1</span><span>2</span></article>',
    );
    expect(
      JSON.parse(readFileSync(join(root, 'dist', 'main.mjs.map'), 'utf8')).sourcesContent.join(''),
    ).toContain('value');
  });
  it.each(['webpack', 'rspack'] as const)('bundles with %s', async (tool) => {
    const root = fixture();
    const config = {
      mode: 'none' as const,
      target: 'node',
      entry: join(root, 'entry.ts'),
      output: { path: join(root, 'dist'), filename: 'main.cjs', library: { type: 'commonjs2' } },
      plugins: [tool === 'webpack' ? webpackPlugin({ root }) : rspackPlugin({ root })],
    };
    const compiler =
      tool === 'webpack'
        ? webpack(config as webpack.Configuration)
        : rspack(config as Parameters<typeof rspack>[0]);
    if (!compiler) throw new Error('Missing compiler');
    try {
      await new Promise<void>((resolve, reject) =>
        compiler.run((error, stats) => {
          if (error) reject(error);
          else if (stats?.hasErrors())
            reject(new Error(stats.toString({ all: false, errors: true })));
          else resolve();
        }),
      );
      const loaded = createRequire(import.meta.url)(join(root, 'dist', 'main.cjs'));
      expect(renderToStaticMarkup(loaded.view)).toBe(
        '<article><span>1</span><span>2</span></article>',
      );
      expect(loaded.result).toEqual([2, 4, 6]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        compiler.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
