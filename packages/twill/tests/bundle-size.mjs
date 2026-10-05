import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build, transform } from 'esbuild';
import { createRequire } from 'node:module';
import twill from '../dist/esbuild.js';

const root = mkdtempSync(join(tmpdir(), 'twill-bundle-size-'));
const fixtures = [
  {
    name: 'validated-pipeline',
    extension: 'twill',
    nativeExtension: 'ts',
    sugar:
      'export function run(input: number[] | undefined) { guard const values = input else { return []; } return values.filter { value in value >= 0 }.map { value in value * 2 }; }',
    native:
      'export function run(input: number[] | undefined) { const values = input; if (values == null) return []; return values.filter(value => value >= 0).map(value => value * 2); }',
  },
  {
    name: 'react-single-child',
    extension: 'twillx',
    nativeExtension: 'tsx',
    sugar: 'export function App({Card}: {Card: any}) { return Card({title:"Hi"}) { "Hello" }; }',
    native: 'export function App({Card}: {Card: any}) { return <Card title="Hi">Hello</Card>; }',
  },
];
const results = [];
try {
  for (const fixture of fixtures) {
    const buildSource = async (source, extension, plugins) => {
      const entry = join(root, 'entry.' + extension);
      writeFileSync(entry, source);
      const result = await build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        minify: true,
        jsx: 'automatic',
        external: ['react/jsx-runtime'],
        plugins,
        metafile: true,
      });
      return { code: result.outputFiles[0].text, inputs: Object.keys(result.metafile.inputs) };
    };
    const native = await buildSource(fixture.native, fixture.nativeExtension, []);
    const dialect = await buildSource(fixture.sugar, fixture.extension, [twill({ root })]);
    // Identifier mangling depends on input character frequencies. Compare bytes
    // and execution rather than requiring the same arbitrary short names.
    assert.equal(
      Buffer.byteLength(dialect.code),
      Buffer.byteLength(native.code),
      `${fixture.name}: application output grew beyond native TS/JSX`,
    );
    assert(
      !dialect.inputs.some((input) => /node_modules/.test(input)),
      'Compiler/runtime libraries must not enter these application fixtures',
    );
    const evaluate = async (code) => {
      const compiled = await transform(code, { format: 'cjs' });
      const module = { exports: {} };
      new Function('module', 'exports', 'require', compiled.code)(
        module,
        module.exports,
        createRequire(import.meta.url),
      );
      return module.exports;
    };
    const nativeModule = await evaluate(native.code);
    const dialectModule = await evaluate(dialect.code);
    if (fixture.extension === 'twill')
      for (const input of [undefined, null, [], [-2, -0, 0, 1, 2, NaN, Infinity]])
        assert.deepEqual(dialectModule.run(input), nativeModule.run(input));
    else {
      const Card = (props) => props.children;
      assert.deepEqual(dialectModule.App({ Card }), nativeModule.App({ Card }));
    }
    results.push({
      name: fixture.name,
      bytes: Buffer.byteLength(dialect.code),
      gzipBytes: gzipSync(dialect.code).length,
      nativeBytes: Buffer.byteLength(native.code),
      byteParity: true,
      behaviorParity: true,
      frameworkRuntimeExternal: fixture.extension === 'twillx',
    });
  }
  const report = {
    node: process.version,
    packageVersion: JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version,
    scope:
      'Minified application output for two representative supported paths; excludes host/framework runtime and does not cover dynamic cleanup or child collection.',
    results,
  };
  const output = process.argv.indexOf('--output');
  if (output >= 0) writeFileSync(process.argv[output + 1], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
