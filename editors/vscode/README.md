# Twill for Visual Studio Code

**Clearer flow. Same TypeScript.**

Twill adds trailing closures, early-exit guards, scope-based cleanup and checked switch expressions to JavaScript and TypeScript. This extension brings the language into your normal VS Code workflow, with TypeScript assistance, formatting and source debugging.

Built by [forth.ink](https://forth.ink). Publisher ID: `forth-ink` · Extension ID: `forth-ink.twill` · Requires VS Code 1.95.3 or newer.

[Get started](https://swiftuijs.github.io/twill/getting-started) · [Language guide](https://swiftuijs.github.io/twill/language) · [Playground](https://swiftuijs.github.io/twill/playground) · [Report an issue](https://github.com/swiftuijs/twill/issues)

## Write clearer everyday code

Use existing callback APIs with trailing closures and contextual TypeScript types:

```typescript
const doubled = [1, 2, 3].map { value in value * 2 };
const activeUsers = users.filter { .active };
```

Keep the failure path explicit and the narrowed value in scope:

```typescript
function displayName(user: { name: string } | undefined): string {
  guard const name = user?.name else {
    return 'Guest';
  }
  return name.toUpperCase();
}
```

Keep cleanup beside acquisition, including awaited cleanup in async functions:

```typescript
import { open } from 'node:fs/promises';

async function readText(path: string): Promise<string> {
  const file = await open(path, 'r');
  defer { await file.close(); }
  return await file.readFile('utf8');
}
```

Twill compiles to ordinary JavaScript with no language runtime library. Existing `.ts`, `.tsx`, `.js` and `.jsx` files can import Twill modules and be imported by them. For the semantics and costs of each feature, see [syntax](https://swiftuijs.github.io/twill/syntax) and [performance](https://swiftuijs.github.io/twill/performance).

## What the extension provides

| Feature               | In your project                                                                   |
| --------------------- | --------------------------------------------------------------------------------- |
| Syntax highlighting   | TS/TSX-aware grammars, comments and bracket matching in `.twill` and `.twillx`    |
| TypeScript assistance | Contextual completion, callback and React prop types, hover and signature help    |
| Diagnostics           | Type and syntax errors mapped to your original source                             |
| Navigation            | Definitions and references across Twill and native TS/JS, including unsaved edits |
| Source editing        | Automatic imports, mixed-file rename, import organization and safe quick fixes    |
| Formatting            | Format Document and format-on-save, with Twill syntax preserved                   |
| Inspection            | Generated TypeScript and project diagnostic views                                 |
| Node debugging        | Original-source breakpoints and stack frames through the Twill ESM loader         |

The extension bundles its compiler, formatter, TypeScript engine and native TS-server bridge. Editing does not require a global Twill installation. Your application supplies its framework types and installs `@swiftuijs/twill` for builds, source execution and whole-project checks.

## Get started

### Install the extension

Open **Extensions** in VS Code, search for **Twill** by **forth.ink**, and choose **Install**. You can also install by the exact extension ID:

```sh
code --install-extension forth-ink.twill
```

For offline installation, download `twill.vsix` from the matching [GitHub release](https://github.com/swiftuijs/twill/releases), then choose **Extensions → … → Install from VSIX**.

Open the application folder containing `tsconfig.json`. If it was already open when you installed the extension, run **TypeScript: Restart TS Server** from the command palette.

### Install the compiler in your application

```sh
pnpm add -D @swiftuijs/twill
# npm install --save-dev @swiftuijs/twill
```

The compiler requires Node 20.19+ or 22.12+. Add the adapter for your existing build tool; for Vite:

```typescript
import { defineConfig } from 'vite';
import twill from '@swiftuijs/twill/vite';

export default defineConfig({ plugins: [twill()] });
```

React applications should use [the React Vite adapter](https://swiftuijs.github.io/twill/frameworks#react-with-vite-8) for Fast Refresh. Rollup, esbuild, webpack and Rspack have their own [build adapters](https://swiftuijs.github.io/twill/build-tools).

### Add one Twill module

Use `.twill` for TypeScript with optional types, or `.twillx` for TSX and component closures. Include your source directory in the normal tsconfig, for example `"include": ["src/**/*"]`. Keep your existing strictness, JSX settings and library types. No `twill.config.json`, wildcard ambient module declaration or component registry is required.

Run the authoritative project checker before building:

```sh
pnpm exec twill check -p tsconfig.json
```

Native `tsc` cannot parse Twill syntax. The extension supplies mixed-file editor assistance; `twill check` checks the complete project. Libraries can emit [ordinary declarations](https://swiftuijs.github.io/twill/libraries) for native TypeScript consumers.

## React and Vue

Import components directly in `.twillx`. Uppercase component closures become ordinary JSX children, or lazy Vue slots selected through your standard JSX settings:

```typescript
import { Panel } from './Panel';

export default function App() {
  return Panel { <p>Hello from Twill</p>; };
}
```

Native JSX remains available. `.twill`, lowercase UI calls and parenthesized UI callables retain ordinary callback semantics. Component libraries use their native props and children contracts; no Twill wrapper API is needed. See [React and Vue](https://swiftuijs.github.io/twill/frameworks).

## Format on save

Use the bundled formatter in `.vscode/settings.json`:

```json
{
  "[twill-typescript]": {
    "editor.defaultFormatter": "forth-ink.twill",
    "editor.formatOnSave": true
  },
  "[twill-tsx]": {
    "editor.defaultFormatter": "forth-ink.twill",
    "editor.formatOnSave": true
  }
}
```

The bundled provider follows editor indentation and Prettier defaults. To share a project's `.prettierrc` with CLI formatting, install `@swiftuijs/twill-formatter` and use the standard Prettier extension instead. See [formatter setup](https://swiftuijs.github.io/twill/tooling#format-your-source).

## Add ESLint

Install `@swiftuijs/twill-linter` alongside ESLint and use its recommended flat configuration. For in-editor feedback, install Microsoft's ESLint extension and add the Twill language IDs to your existing validation settings:

```json
{
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact",
    "twill-typescript",
    "twill-tsx"
  ]
}
```

Linting is optional and supplied by the independent ESLint plugin. See [recommended and type-aware setup](https://swiftuijs.github.io/twill/tooling#add-eslint).

## Inspect and debug

| Command palette action               | What it does                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| **Twill: Show Generated TypeScript** | Opens readable compiled TS/TSX beside your source                              |
| **Twill: Show Project Diagnostics**  | Shows configuration, source counts, versions and diagnostics                   |
| **Twill: Debug Current File**        | Runs the file with the local compiler's ESM loader and VS Code's Node debugger |

The debug command executes the selected application file. Install `@swiftuijs/twill` locally and use the application's normal dependencies and environment. For a fixed entry point or custom launch settings, see [Node debugging](https://swiftuijs.github.io/twill/tooling#debug-node-code). Browser and framework applications use their existing developer tools and source maps.

## Troubleshooting

| Symptom                                        | What to check                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A native TS file cannot resolve a Twill import | Open the folder with its tsconfig and run **TypeScript: Restart TS Server**                                                                   |
| Completion stops near unfinished code          | Repair nearby syntax and check **Twill: Show Project Diagnostics**; common incomplete inputs are supported, arbitrary malformed syntax is not |
| Framework props are missing                    | Install framework types and check standard JSX / `jsxImportSource` settings                                                                   |
| Format Document ignores `.prettierrc`          | Select the standard Prettier extension with the project formatter plugin                                                                      |
| ESLint skips Twill files                       | Load the Twill flat config and add both language IDs to `eslint.validate`                                                                     |
| A rename or fix is unavailable                 | The edit may cross generated syntax; edits that cannot map safely are withheld                                                                |

## Compatibility and support

Twill's 0.x release line is experimental. The checker and extension use the pinned TypeScript 5.9 semantics; arbitrary workspace TypeScript versions are outside the tested contract. General refactoring and fix-all are unavailable. The Node loader supports local ESM mixed projects; it does not install a CommonJS dialect loader or transform dependencies.

Review [support and limitations](https://swiftuijs.github.io/twill/readiness) before adopting Twill in a production project. [GitHub highlighting](https://swiftuijs.github.io/twill/github) is configured separately; installing the extension does not change GitHub's language detection.

For a bug report, include a minimal source example, extension/compiler versions, VS Code and Node versions, and relevant tsconfig settings. Project diagnostic reports can contain filenames and source messages; review them before sharing. Use [GitHub Issues](https://github.com/swiftuijs/twill/issues) for reproducible problems.

MIT licensed · [Source](https://github.com/swiftuijs/twill) · [forth.ink](https://forth.ink)
