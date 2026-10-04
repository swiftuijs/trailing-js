import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build as esbuild } from 'esbuild';
import { rollup } from 'rollup';
import { build as vite, createServer } from 'vite';
import esbuildPlugin from '../src/esbuild';
import rollupPlugin from '../src/rollup';
import vitePlugin from '../src/vite';
import webpack from 'webpack';
import { rspack } from '@rspack/core';
import webpackPlugin from '../src/webpack';
import rspackPlugin from '../src/rspack';
import { createRequire } from 'node:module';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'twill-build-'));
  roots.push(root);
  writeFileSync(join(root, 'numbers.twill'), 'export const values: number[] = [1,2,3];');
  writeFileSync(
    join(root, 'double.twill.js'),
    'export function double(x) { guard x > 0 else { return 0; } let result = x * 2; defer { result = 0; } return result; }',
  );
  writeFileSync(
    join(root, 'main.twill'),
    'import {values} from "./numbers"; import {double} from "./double"; export const result = values.map() { (x: number) in defer {} guard x > 0 else { throw new Error(); } return double(x); };',
  );
  return root;
}

describe('real build tools', () => {
  it('bundles TypeScript and extensionless imports with esbuild', async () => {
    const root = fixture();
    const result = await esbuild({
      entryPoints: [join(root, 'main.twill')],
      bundle: true,
      format: 'cjs',
      write: false,
      sourcemap: 'inline',
      plugins: [esbuildPlugin({ root })],
    });
    const module = { exports: {} as { result: number[] } };
    Function('module', 'exports', result.outputFiles![0]!.text)(module, module.exports);
    expect(module.exports.result).toEqual([2, 4, 6]);
    expect(result.outputFiles![0]!.text).toContain('sourceMappingURL=data:');
  });
  it('bundles with Rollup and preserves original sources in maps', async () => {
    const root = fixture();
    const bundle = await rollup({
      input: join(root, 'main.twill'),
      plugins: [rollupPlugin({ root })],
    });
    try {
      const { output } = await bundle.generate({ format: 'cjs', sourcemap: true });
      const chunk = output[0]!;
      if (chunk.type !== 'chunk') throw new Error('Expected chunk');
      const exports = {} as { result: number[] };
      Function('exports', chunk.code)(exports);
      expect(exports.result).toEqual([2, 4, 6]);
      expect(chunk.map?.sources.map((source) => source.split('/').at(-1))).toEqual(
        expect.arrayContaining(['main.twill', 'numbers.twill']),
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
      expect((await server.ssrLoadModule('/main.twill')).result).toEqual([2, 4, 6]);
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
        lib: { entry: join(root, 'main.twill'), formats: ['es'], fileName: () => 'main.mjs' },
        sourcemap: true,
      },
    });
    const module = await import(pathToFileURL(join(root, 'dist', 'main.mjs')).href);
    expect(module.result).toEqual([2, 4, 6]);
    expect(
      JSON.parse(readFileSync(join(root, 'dist', 'main.mjs.map'), 'utf8')).sourcesContent.join(''),
    ).toContain('value');
  });
  it.each(['webpack', 'rspack'] as const)('bundles with %s', async (tool) => {
    const root = fixture();
    const config = {
      mode: 'none' as const,
      target: 'node',
      entry: join(root, 'main.twill'),
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
      expect(createRequire(import.meta.url)(join(root, 'dist', 'main.cjs')).result).toEqual([
        2, 4, 6,
      ]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        compiler.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
