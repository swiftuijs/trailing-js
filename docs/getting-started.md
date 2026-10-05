# Getting started

Twill is TypeScript with a small layer of syntax sugar. Use `.twill` for TS (including ordinary JS syntax) and `.twillx` for TSX. Native `.ts`, `.tsx`, `.js` and `.jsx` files keep their usual syntax.

## Try it first

The [playground](./playground.md) runs the actual compiler in a browser worker. It shows generated TS/TSX without sending your source to a server. It does not execute code or type-check project imports.

## Install a reviewed build

The packages have not been published to npm or the Marketplace yet. Use the `twill-packages` artifact from a successful [CI run](https://github.com/swiftuijs/twill/actions), or build a checkout:

```sh
git clone https://github.com/swiftuijs/twill.git
cd twill
pnpm install --frozen-lockfile
pnpm build
pnpm package:core
pnpm package:tooling
pnpm editor:package
```

Repository development uses Node 22.13+ (or Node 24+) and the pnpm version in `packageManager`. The distributed compiler supports Node 20.19+. Install the generated tarballs into an application:

```sh
pnpm add -D /path/to/swiftuijs-twill-0.8.0.tgz
pnpm add -D /path/to/swiftuijs-twill-formatter-0.8.0.tgz prettier
pnpm add -D /path/to/swiftuijs-twill-linter-0.8.0.tgz eslint
```

Install `dist/twill.vsix` with VS Code's **Extensions → Install from VSIX** command. The extension includes TypeScript checking and formatting; your application supplies framework types and dependencies.

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

Place both files in `src`. Use `pnpm exec twill check -p tsconfig.json` for type checking. Native `tsc` cannot parse Twill source. Native consumers can use [generated declarations](./tooling.md#user-library-declarations).

## Build with Vite

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

Use `recommendedTypeChecked` for type-aware linting; it requires a tsconfig and detects missing union cases in switches, even with a `default` branch. Add normal browser/Node globals for your application. VS Code's ESLint extension can validate `twill-typescript` and `twill-tsx`. See [practical patterns](./patterns.md) for validation, owned resources and explicit outcomes, and [tooling](./tooling.md) for safe fixes, debugging, diagnostics and library builds.

## Run Node code

```sh
node --enable-source-maps --import @swiftuijs/twill/register src/main.twill
```

The loader handles local mixed TS/JS/Twill imports. It does not transform dependencies or replace Node's CommonJS behavior.

## Adopt one module or export native sources

Keep native TS/JS files alongside Twill and start with a validation or resource-management task. The optional migration package can export a checked source graph to a new native TS/TSX directory without modifying originals. See [adoption and migration](./adoption.md) for the commands, dependency setup and export boundaries.
