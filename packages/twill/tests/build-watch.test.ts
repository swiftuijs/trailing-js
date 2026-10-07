import { afterEach, expect, it } from 'vitest';
import { readFileSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { context } from 'esbuild';
import { watch } from 'rollup';
import webpack from 'webpack';
import { rspack } from '@rspack/core';
import esbuildPlugin from '../src/esbuild';
import rollupPlugin from '../src/rollup';
import webpackPlugin from '../src/webpack';
import rspackPlugin from '../src/rspack';
import { fixtureRoot } from './helpers/fixture';

type Output = { values: (number | undefined)[]; native: number; view: string; nativeView: string };
type Event = { output?: Output; error?: string; sources?: string[] };
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = fixtureRoot('build-watch-');
  roots.push(root);
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(join(root, 'twill.config.json'), '{"implicitReturn":true}');
  writeFileSync(
    join(root, 'base.json'),
    '{"compilerOptions":{"jsx":"react-jsx","jsxImportSource":"runtime-a"}}',
  );
  writeFileSync(
    join(root, 'tsconfig.json'),
    '{"extends":"./base.json","include":["*.ts","*.tsx"]}',
  );
  writeFileSync(join(root, 'offset.js'), 'export const offset = 0;');
  writeFileSync(
    join(root, 'native.ts'),
    'import {offset} from "./offset.js"; export const native: number = 10 + offset;',
  );
  writeFileSync(join(root, 'view.twillx'), 'export const view = <span>dialect</span>;');
  writeFileSync(join(root, 'view.tsx'), 'export const nativeView = <span>native</span>;');
  writeFileSync(
    join(root, 'entry.twill'),
    'export {native} from "./native"; export {view} from "./view.twillx"; export {nativeView} from "./view.tsx"; export const values = [1,2].map { value in value * 2; };',
  );
  return root;
}
function evaluate(code: string): Output {
  const module = { exports: {} };
  const require = createRequire(import.meta.url);
  Function(
    'module',
    'exports',
    'require',
    code,
  )(module, module.exports, (id: string) =>
    id.startsWith('runtime-')
      ? { jsx: (_: string, props: { children: string }) => id + ':' + props.children }
      : require(id),
  );
  return module.exports as Output;
}
function events() {
  const pending: Event[] = [];
  const history: Event[] = [];
  let notify: (() => void) | undefined;
  return {
    push(event: Event) {
      pending.push(event);
      history.push(event);
      notify?.();
    },
    async next(predicate: (event: Event) => boolean): Promise<Event> {
      const deadline = Date.now() + 10000;
      while (true) {
        const event = pending.shift();
        if (event && predicate(event)) {
          // Host callbacks can precede watcher rearming/snapshot completion.
          // Allow a normal editor save interval before the next edit.
          await new Promise((resolve) => setTimeout(resolve, 100));
          return event;
        }
        if (pending.length) continue;
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => {
              notify = undefined;
              reject(Error('No matching watch build: ' + JSON.stringify(history.slice(-3))));
            },
            Math.max(1, deadline - Date.now()),
          );
          notify = () => {
            clearTimeout(timeout);
            notify = undefined;
            resolve();
          };
        });
      }
    },
  };
}
function save(filename: string, source: string) {
  writeFileSync(filename, source);
}
const external = (id: string) => id.startsWith('runtime-');
async function start(
  tool: 'rollup' | 'rollup-atomic' | 'esbuild' | 'webpack' | 'rspack',
  root: string,
  queue: ReturnType<typeof events>,
) {
  const entry = join(root, 'entry.twill'),
    outfile = join(root, 'dist', 'main.cjs');
  const read = (): Event => ({
    output: evaluate(readFileSync(outfile, 'utf8')),
    sources: JSON.parse(readFileSync(outfile + '.map', 'utf8')).sources,
  });
  if (tool === 'esbuild') {
    const build = await context({
      entryPoints: [entry],
      bundle: true,
      format: 'cjs',
      platform: 'node',
      outfile,
      sourcemap: true,
      jsx: 'automatic',
      logLevel: 'silent',
      external: ['runtime-*'],
      plugins: [
        esbuildPlugin({ root }),
        {
          name: 'observe',
          setup(build) {
            build.onEnd((result) => {
              queue.push(
                result.errors.length
                  ? { error: result.errors.map((error) => error.text).join('\n') }
                  : read(),
              );
            });
          },
        },
      ],
    });
    await build.watch();
    return () => build.dispose();
  }
  if (tool === 'rollup' || tool === 'rollup-atomic') {
    const watcher = watch({
      input: entry,
      plugins: [rollupPlugin({ root })],
      external,
      output: { file: outfile, format: 'cjs', sourcemap: true },
      watch: {
        clearScreen: false,
        ...(tool === 'rollup-atomic' ? { chokidar: { usePolling: true, interval: 25 } } : {}),
      },
    });
    watcher.on('event', async (event) => {
      if (event.code === 'BUNDLE_END') {
        await event.result.close();
        queue.push(read());
      }
      if (event.code === 'ERROR') queue.push({ error: event.error.message });
    });
    return () => watcher.close();
  }
  const config = {
    mode: 'none' as const,
    target: 'node',
    entry,
    devtool: 'source-map',
    output: { path: join(root, 'dist'), filename: 'main.cjs', library: { type: 'commonjs2' } },
    externals: [/^runtime-/],
    plugins: [tool === 'webpack' ? webpackPlugin({ root }) : rspackPlugin({ root })],
  };
  const compiler =
    tool === 'webpack'
      ? webpack(config as webpack.Configuration)
      : rspack(config as Parameters<typeof rspack>[0]);
  if (!compiler) throw Error('Missing compiler');
  const watching = compiler.watch({ aggregateTimeout: 20 }, (error, stats) => {
    queue.push(
      error || stats?.hasErrors()
        ? { error: error?.message ?? stats!.toString({ all: false, errors: true }) }
        : read(),
    );
  });
  if (!watching) throw Error('Missing watcher');
  return async () => {
    await new Promise<void>((resolve, reject) =>
      watching.close((error?: Error | null) => (error ? reject(error) : resolve())),
    );
    await new Promise<void>((resolve, reject) =>
      compiler.close((error) => (error ? reject(error) : resolve())),
    );
  };
}

it.each(['rollup', 'esbuild', 'webpack', 'rspack', 'rollup-atomic'] as const)(
  '%s watches mixed sources, config dependencies, errors and recovery',
  async (tool) => {
    const root = fixture(),
      queue = events(),
      close = await start(tool, root, queue);
    const edit = (filename: string, source: string) => {
      if (tool === 'rollup-atomic') {
        writeFileSync(filename + '.tmp', source);
        renameSync(filename + '.tmp', filename);
      } else save(filename, source);
    };
    const output = async (predicate: (output: Output) => boolean) =>
      (await queue.next((event) => !!event.output && predicate(event.output))).output!;
    try {
      const initial = await output((value) => value.native === 10);
      expect(initial).toMatchObject({
        values: [2, 4],
        native: 10,
        view: 'runtime-a/jsx-runtime:dialect',
        nativeView: 'runtime-a/jsx-runtime:native',
      });
      edit(
        join(root, 'native.ts'),
        'import {offset} from "./offset.js"; export const native: number = 20 + offset;',
      );
      expect((await output((value) => value.native === 20)).values).toEqual([2, 4]);
      edit(join(root, 'offset.js'), 'export const offset = 5;');
      expect((await output((value) => value.native === 25)).values).toEqual([2, 4]);
      edit(join(root, 'view.twillx'), 'export const view = <span>updated</span>;');
      await output((value) => value.view === 'runtime-a/jsx-runtime:updated');
      edit(join(root, 'view.tsx'), 'export const nativeView = <span>changed</span>;');
      await output((value) => value.nativeView === 'runtime-a/jsx-runtime:changed');
      edit(
        join(root, 'entry.twill'),
        readFileSync(join(root, 'entry.twill'), 'utf8').replace('value * 2', 'value * 3'),
      );
      expect((await output((value) => value.values[0] === 3)).values).toEqual([3, 6]);
      edit(join(root, 'twill.config.json'), '{"implicitReturn":false}');
      expect((await output((value) => value.values[0] === undefined)).values).toEqual([
        undefined,
        undefined,
      ]);
      edit(join(root, 'twill.config.json'), '{"implicitReturn":"invalid"}');
      expect((await queue.next((event) => !!event.error)).error).toContain(
        'implicitReturn must be a boolean',
      );
      edit(join(root, 'twill.config.json'), '{"implicitReturn":true}');
      await output((value) => value.values[0] === 3);
      edit(
        join(root, 'base.json'),
        '{"compilerOptions":{"jsx":"react-jsx","jsxImportSource":"runtime-b"}}',
      );
      expect(
        (await output((value) => value.view === 'runtime-b/jsx-runtime:updated')).nativeView,
      ).toBe('runtime-b/jsx-runtime:changed');
      edit(join(root, 'entry.twill'), 'export const values = [1].map { value in ;');
      expect((await queue.next((event) => !!event.error)).error).toBeTruthy();
      edit(
        join(root, 'entry.twill'),
        'export {native} from "./native"; export const values = [1,2].map { value in value * 4; };',
      );
      const recovered = await queue.next((event) => event.output?.values[0] === 4);
      expect(recovered.output?.values).toEqual([4, 8]);
      expect(recovered.sources?.some((source) => source.includes('entry.twill'))).toBe(true);
      expect(recovered.sources?.some((source) => source.includes('native.ts'))).toBe(true);
      // Changing the default explicitly makes deletion/creation observable.
      edit(join(root, 'twill.config.json'), '{"implicitReturn":false}');
      await output((value) => value.values[0] === undefined);
      rmSync(join(root, 'twill.config.json'));
      await output((value) => value.values[0] === 4);
      edit(join(root, 'twill.config.json'), '{"implicitReturn":false}');
      await output((value) => value.values[0] === undefined);
    } finally {
      await close();
    }
  },
);

it('esbuild contexts reread config on explicit incremental rebuilds and preserve explicit overrides', async () => {
  const root = fixture();
  const build = await context({
    entryPoints: [join(root, 'entry.twill')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    jsx: 'automatic',
    external: ['runtime-*'],
    plugins: [esbuildPlugin({ root, implicitReturn: true })],
  });
  try {
    expect(evaluate((await build.rebuild()).outputFiles![0]!.text).values).toEqual([2, 4]);
    save(join(root, 'twill.config.json'), '{"implicitReturn":false}');
    save(
      join(root, 'base.json'),
      '{"compilerOptions":{"jsx":"react-jsx","jsxImportSource":"runtime-b"}}',
    );
    const updated = evaluate((await build.rebuild()).outputFiles![0]!.text);
    expect(updated.values).toEqual([2, 4]);
    expect(updated.view).toBe('runtime-b/jsx-runtime:dialect');
    expect(updated.nativeView).toBe('runtime-b/jsx-runtime:native');
  } finally {
    await build.dispose();
  }
});

it.each(['webpack', 'rspack'] as const)(
  '%s keeps nativeSources:false under the application loader',
  async (tool) => {
    const root = fixture();
    const loader = join(root, 'native-loader.cjs');
    writeFileSync(
      loader,
      `const ts = require('typescript');
module.exports = function(source) {
 return ts.transpileModule(source, {compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX, jsxImportSource: 'runtime-owner'
 }}).outputText;
};`,
    );
    const config = {
      mode: 'none' as const,
      target: 'node',
      entry: join(root, 'entry.twill'),
      output: { path: join(root, 'dist'), filename: 'owned.cjs', library: { type: 'commonjs2' } },
      module: { rules: [{ test: /\.[jt]sx?$/, use: [loader] }] },
      externals: [/^runtime-/],
      plugins: [
        tool === 'webpack'
          ? webpackPlugin({ root, nativeSources: false })
          : rspackPlugin({ root, nativeSources: false }),
      ],
    };
    const compiler =
      tool === 'webpack'
        ? webpack(config as webpack.Configuration)
        : rspack(config as Parameters<typeof rspack>[0]);
    if (!compiler) throw Error('Missing compiler');
    try {
      await new Promise<void>((resolve, reject) =>
        compiler.run((error, stats) => {
          if (error) reject(error);
          else if (stats?.hasErrors()) reject(Error(stats.toString({ all: false, errors: true })));
          else resolve();
        }),
      );
      const loaded = evaluate(readFileSync(join(root, 'dist', 'owned.cjs'), 'utf8'));
      expect(loaded.values).toEqual([2, 4]);
      expect(loaded.native).toBe(10);
      expect(loaded.view).toBe('runtime-a/jsx-runtime:dialect');
      expect(loaded.nativeView).toBe('runtime-owner/jsx-runtime:native');
    } finally {
      await new Promise<void>((resolve, reject) =>
        compiler.close((error) => (error ? reject(error) : resolve())),
      );
    }
  },
);
