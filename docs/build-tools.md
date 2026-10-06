# Build tools

Install `@swiftuijs/twill` as a development dependency in your application. Select the adapter for your existing bundler. Native TS/JS and Twill can share the graph; no component lists, wrapping APIs or Twill config file are needed.

Run `twill check` separately before production builds. Adapters emit code and source maps; they do not perform project type checking.

## Vite

`vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import twill from '@swiftuijs/twill/vite';

export default defineConfig({ plugins: [twill()] });
```

Keep normal Vite development/build scripts. Vite handles native TS/JSX emission; Twill handles `.twill` and `.twillx`. Use your ordinary tsconfig JSX settings.

For React Fast Refresh, use the [React adapter](./frameworks.md#react-with-vite-8) instead of independently adding the base Twill and React plugins. Vue JSX and SFC behavior are described in [React and Vue](./frameworks.md#vue).

## Rollup

```ts
import twill from '@swiftuijs/twill/rollup';

export default {
  input: 'src/main.twill',
  plugins: [twill()],
  output: { dir: 'dist', format: 'es', sourcemap: true },
};
```

Keep your standard dependency resolution, CommonJS conversion and other Rollup plugins. The adapter emits local native TS/TSX/JSX by default, as well as Twill.

## esbuild

```ts
import { build } from 'esbuild';
import twill from '@swiftuijs/twill/esbuild';

await build({
  entryPoints: ['src/main.twill'],
  bundle: true,
  outfile: 'dist/main.js',
  format: 'esm',
  sourcemap: true,
  plugins: [twill()],
});
```

esbuild keeps its native TS/JSX pipeline. Set normal platform, target and dependency externalization options for your application.

## webpack and Rspack

In an ESM configuration, add the matching adapter to the host's existing plugins:

```ts
// webpack.config.mjs
import twill from '@swiftuijs/twill/webpack';

export default {
  entry: './src/main.twill',
  plugins: [twill()],
  devtool: 'source-map',
};
```

```ts
// rspack.config.mjs
import twill from '@swiftuijs/twill/rspack';

export default {
  entry: './src/main.twill',
  plugins: [twill()],
  devtool: 'source-map',
};
```

Both adapters emit local native TS/TSX/JSX by default. Keep framework, CSS, assets and CommonJS handling in the host's standard configuration.

## Avoid duplicate native emission

Vite and esbuild delegate native TS/JSX to the host by default. Rollup, webpack and Rspack enable the adapter's native emitter by default. If another plugin or loader already owns that work, use:

```ts
plugins: [twill({ nativeSources: false })];
```

`nativeSources: true` explicitly enables Twill's native emitter. Standard files retain their native syntax; they never acquire trailing-closure or implicit-return behavior.

Relative extensionless imports are resolved by default. `resolveExtensions: false` delegates that work to your existing resolver. Prefer explicit local extensions where host aliases cannot infer a Twill file. Package exports, aliases, dependency transforms and deployment behavior remain the host's responsibility.

Use normal tsconfig or file-level `@jsxImportSource` settings to choose the JSX runtime. Keep language settings consistent between the build and checker; ad hoc build-only overrides can otherwise make editor types differ from emitted code.

## Node ESM

For source execution without a bundler:

```sh
node --enable-source-maps --import @swiftuijs/twill/register src/main.twill
```

Use ESM for native entry modules (`"type": "module"` in package.json or an `.mjs` entry). The loader supports local ESM native TS/JS/Twill graphs and delegates dependencies to Node. It does not add tsconfig path-alias resolution or a CommonJS Twill loader. See [mixed-project Node behavior](./interoperability.md#node) and [debugging](./tooling.md#debug-node-code).

For libraries, pair a normal JS bundle with [declaration emission](./libraries.md). For application quality gates, use the [editor and tooling guide](./tooling.md#check-before-building).
