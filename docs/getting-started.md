# Getting started

Twill is TypeScript with a small layer of syntax sugar. Use `.twill` for TS (including ordinary JS syntax) and `.twillx` for TSX. Native `.ts`, `.tsx`, `.js` and `.jsx` files keep their usual syntax.

## Try it first

The [playground](./playground.md) runs the actual compiler in a browser worker. It shows generated TS/TSX without sending your source to a server. It does not execute code or type-check project imports.

## Install a reviewed build

The packages have not been published to npm or the Marketplace yet. Download the `twill-packages` artifact from a successful [CI run](https://github.com/swiftuijs/twill/actions/workflows/ci.yml) and extract it outside your application's source directory. It contains reviewed package tarballs, `twill.vsix` and a checksum manifest.

The compiler supports Node 20.19+ or 22.12+. From **your application root**, install the compiler and optional formatting/linting packages using the extracted tarball paths:

```sh
pnpm add -D /path/to/swiftuijs-twill-0.9.0.tgz
pnpm add -D /path/to/swiftuijs-twill-formatter-0.9.0.tgz prettier
pnpm add -D /path/to/swiftuijs-twill-linter-0.9.0.tgz eslint
```

Install the extracted `twill.vsix` with VS Code's **Extensions → Install from VSIX** command. The extension includes TypeScript checking and formatting; your application supplies framework types and dependencies.

## Write an ordinary module

`numbers.twill`:

```twill
export const doubled = [1, 2, 3].map { value in
  value * 2;
};
```

`main.ts`:

```ts
import { doubled } from './numbers.twill';
console.log(doubled);
```

A basic `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler"
  },
  "include": ["src/**/*"]
}
```

Place both files in `src`. Use `pnpm exec twill check -p tsconfig.json` for type checking. Native `tsc` cannot parse Twill source. Native consumers can use [generated declarations](./libraries.md).

## Build with Vite

In your existing Vite application, keep its usual entry point and scripts and add the Twill adapter to `vite.config.ts`. Install Vite alongside the compiler if it is not already present. Other bundler configurations are in [build tools](./build-tools.md).

```ts
import { defineConfig } from 'vite';
import twill from '@swiftuijs/twill/vite';

export default defineConfig({ plugins: [twill()] });
```

For React state-preserving development, use the [React Vite integration](./frameworks.md). Component libraries use their ordinary APIs; no component registry or Twill wrapper is needed.

`twill.config.json` is optional. The default settings enable trailing closures, single-expression returns, `guard` and `defer`. JSX settings come from the project's normal `tsconfig.json` or a file-level `@jsxImportSource` pragma. Only create a Twill configuration when changing a language option, such as disabling implicit returns with `{ "implicitReturn": false }`.

## Format and lint

`.prettierrc.json`:

```json
{ "plugins": ["@swiftuijs/twill-formatter"], "singleQuote": true }
```

`eslint.config.mjs`:

```js
import twill from '@swiftuijs/twill-linter';
export default [{ ignores: ['**/dist/**'] }, ...twill.configs.recommended];
```

```sh
pnpm prettier --write src
pnpm eslint src
pnpm exec twill check -p tsconfig.json
```

Use `recommendedTypeChecked` for type-aware linting; it requires a tsconfig and detects missing union cases in switches, even with a `default` branch. Add normal browser/Node globals for your application. VS Code's ESLint extension can validate `twill-typescript` and `twill-tsx`. See [practical patterns](./patterns.md) for validation, owned resources and explicit outcomes, and [tooling](./tooling.md) for safe fixes, debugging and diagnostics.

## Run Node code

```sh
node --enable-source-maps --import @swiftuijs/twill/register src/main.twill
```

The loader handles local mixed TS/JS/Twill imports. It does not transform dependencies or replace Node's CommonJS behavior.

## Adopt one module or export native sources

Keep native TS/JS files alongside Twill and start with a validation or resource-management task. The optional migration package can export a checked source graph to a new native TS/TSX directory without modifying originals. See [adoption and migration](./adoption.md) for the commands, dependency setup and export boundaries.

## Building Twill itself

Application users do not need to clone the Twill repository. If you want to build the packages from source or contribute to the language, use the [repository development guide](https://github.com/swiftuijs/twill/blob/main/docs/contributing/tooling.md).
