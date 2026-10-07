# Getting started

Twill extends TypeScript and TSX with Swift-inspired syntax, using TypeScript's type system and compiling to ordinary JavaScript. Use `.twill` for TS (including ordinary JS syntax) and `.twillx` for TSX. Native `.ts`, `.tsx`, `.js` and `.jsx` files keep their usual syntax.

## Try it first

The [playground](./playground.md) runs the actual compiler in a browser worker. It shows generated TS/TSX without sending your source to a server. It does not execute code or type-check project imports.

## Install

From **your application root**, install the compiler as a development dependency. Node 20.19+ or 22.12+ is required.

::: code-group

```sh [pnpm]
pnpm add -D @swiftuijs/twill
```

```sh [npm]
npm install --save-dev @swiftuijs/twill
```

```sh [Yarn]
yarn add --dev @swiftuijs/twill
```

:::

Twill compiles away at build time. Your application keeps its normal JavaScript runtime and framework dependencies. No additional language runtime is required.

For editor completion, diagnostics and formatting, install [Twill from the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=forth-ink.twill), or run `code --install-extension forth-ink.twill`. Follow the [VS Code setup](./tooling.md#set-up-vs-code) for configuration. The extension bundles its editing tools; the local compiler supplies builds and whole-project checks.

## Write an ordinary module

Using a coding agent? Install the [official Twill skill](./ai.md) with `npx skills add swiftuijs/twill --skill twill` so it follows the supported syntax and project verification workflow.

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

`twill.config.json` is optional. The default settings enable trailing closures, single-expression returns, `guard` and `defer`. JSX settings come from the project's normal `tsconfig.json` or a file-level `@jsxImportSource` pragma. Only create a Twill configuration when changing a language option, such as disabling implicit returns with `{ "implicitReturn": false }`. The unreleased [optional runtime](./runtime.md) prototype also accepts `runtime: "inline" | "external"`; inline remains the default.

## Format and lint

Install the optional plugins alongside Prettier and ESLint. Keep Twill packages on the same version; formatter and linter dependencies include the matching compiler.

```sh
pnpm add -D @swiftuijs/twill-formatter prettier @swiftuijs/twill-linter eslint
```

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
pnpm exec prettier --write src
pnpm exec eslint src
pnpm exec twill check -p tsconfig.json
```

Use `recommendedTypeChecked` for type-aware linting; it requires a tsconfig and detects missing union cases in switches, even with a `default` branch. Add normal browser/Node globals for your application. VS Code's ESLint extension can validate `twill-typescript` and `twill-tsx`. See [practical patterns](./patterns.md) for validation, owned resources and explicit outcomes, and [tooling](./tooling.md) for safe fixes, debugging and diagnostics.

## Check before shipping

A build adapter emits JavaScript; it does not replace type checking. Add these scripts to your application's `package.json` alongside its existing build and test commands:

```json
{
  "scripts": {
    "typecheck": "twill check -p tsconfig.json",
    "lint": "eslint src",
    "format:check": "prettier --check src",
    "check": "twill check -p tsconfig.json && eslint src && prettier --check src"
  }
}
```

Run `pnpm run check` and your application tests before building in CI. Source diagnostics point back to the original Twill files.

## Run Node code

```sh
node --enable-source-maps --import @swiftuijs/twill/register src/main.twill
```

The loader handles local mixed TS/JS/Twill imports. It does not transform dependencies or replace Node's CommonJS behavior.

## Adopt one module or export native sources

Keep native TS/JS files alongside Twill and start with a validation or resource-management task. The optional export package can export a checked source graph to a new native TS/TSX directory without modifying originals. See [gradual adoption and source export](./adoption.md) for the commands, dependency setup and export boundaries.

## Building Twill itself

Application users do not need to clone the Twill repository. If you want to build the packages from source or contribute to the language, use the [repository development guide](https://github.com/swiftuijs/twill/blob/main/docs/contributing/tooling.md).
