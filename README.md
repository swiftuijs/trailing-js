# Twill

**Twill** is a general-purpose syntax-sugar language built on JavaScript and TypeScript. It borrows concise syntax from Swift and compiles to ordinary JS/TS, with source maps, build plugins, a type checker, and a VS Code extension. Data processing, Node services, async workflows and UI code use the same language.

```ts
const doubled = [1, 2, 3].map { value in value * 2 };
// → [1, 2, 3].map((value) => { return value * 2; });
```

Ordinary callbacks compile to native arrows. In UI files, component closures compile directly to standard JSX: React children or lazy Vue slots. Import components directly from any library. `@swiftuijs/ui` is one example consumer; the compiler has no component-library lists or special cases.

This is an experimental **0.6 language**, with production-oriented packaging and tests. See [the syntax contract and limitations](docs/syntax.md) before adopting it. Until published to npm and the Marketplace, install a locally built tarball and VSIX.

## Quick start

The distributed package requires Node **20.19+ or 22.12+** and is ESM. Use **Node 22.12+** and the pinned **pnpm 11** to develop the repository; Vite builds every workspace package. Enable pnpm through Corepack (`corepack enable`) or install the version in `packageManager`. See [the monorepo and tooling guide](docs/tooling.md).

```sh
git clone https://github.com/swiftuijs/twill.git
cd twill
pnpm install --frozen-lockfile
pnpm build
pnpm package:core
# In your application:
npm install /path/to/swiftuijs-twill-0.6.0.tgz
```

In Vite:

```ts
import { defineConfig } from 'vite';
import twill from '@swiftuijs/twill/vite';

export default defineConfig({ plugins: [twill()] });
```

The repository, npm package, CLI and configuration are `swiftuijs/twill`, `@swiftuijs/twill`, `twill` and `twill.config.json`. No legacy aliases are provided.

| Source extension | Base language |
| ---------------- | ------------- |
| `.twill`         | TypeScript    |
| `.twillx`        | TSX           |

These are the only dialect extensions. JavaScript syntax works in both as TypeScript’s subset; types are optional. `.twillx` also enables JSX and component closures. Native `.ts`, `.tsx`, `.js` and `.jsx` files keep their normal parsers and JS/JSDoc behavior. Files ending in `.js` or `.jsx` are never secretly opted into Twill.

```ts
// main.twill
const values: number[] = [1, 2, 3];
export const doubled = values.map { value in value * 2 };
```

Run type checking separately from bundling:

```sh
npx twill check -p tsconfig.json
```

Include the extended files in your `tsconfig.json`, for example `"include": ["src/**/*"]`. The checker reads your real TypeScript settings, infers callback types, resolves explicit and extensionless local imports, and maps errors back to the original files. Ordinary `tsc` does not parse this syntax.

## Mixing Twill with TS and JS

Both import directions work: Twill can import native TS/JS, and native TS/JS can import Twill. Values, exported types, type-only imports, re-exports and dynamic imports use normal module semantics. Cyclic imports retain ESM live bindings.

```ts
// helpers.ts
export const twice = (value: number): number => value * 2;

// math.twill
import { twice } from './helpers.ts';
export const doubled = [1, 2, 3].map { value in twice(value) };

// consumer.ts (or consumer.js without the annotation)
import { doubled } from './math.twill';
const result: number[] = doubled;
```

Use the Twill build plugin, `twill check`, and the VSIX for a mixed project. Vite/esbuild retain their native TS pipeline; bare Rollup/webpack/rspack receive standard TS/TSX/JSX emission by default. Set `nativeSources: false` when another plugin owns that emission. Native files never use Twill parsing or implicit-return rules. npm dependencies retain their host's handling.

```sh
pnpm dev:mixed     # JS → TS → Twill → TS/JS, with exported types and dynamic imports
npx twill check -p tsconfig.json
node --enable-source-maps --import @swiftuijs/twill/register src/main.js
```

The opt-in Node loader compiles local ESM `.ts`, `.mts`, `.tsx` and `.jsx` as well as Twill, including on Node 20. Standard JS/CJS keeps Node handling. See [interoperability](docs/interoperability.md) for resolution rules, editor setup and CommonJS boundaries. Plain `tsc` does not understand Twill source; TS-server plugins provide editor assistance, rather than changing the command-line compiler.

## Closures

```ts
run { console.log('hello'); };           // no ordinary arguments
items.map { item in item.name };       // a single expression returns its value
items.map { (item: Item) in item.id };  // typed / destructured / default / rest params
withTask() { async () in await fetch('/api') };

perform(21) { value in value * 2 } completion: { value in
  console.log(value);
};
// perform(21, value => value * 2, value => { console.log(value); });
```

Multiple closure labels are readable names; JavaScript receives positional callbacks in written order. Multi-statement ordinary closures require an explicit `return`. Closures use arrow-function lexical `this`, `arguments`, and `super`.

## Early exits and nullish bindings

```ts
function greeting(input: string | null) {
  guard input != null else { return 'Hello'; }
  return `Hello, ${input.toUpperCase()}`; // TS knows input is a string
}

function scoreOf(input: { score: number } | undefined) {
  guard const score = input?.score else { return 0; }
  return score; // checks null/undefined, keeps 0
}
```

`guard condition else { ... }` lowers to `if (!(condition)) { ... }`. `guard const name = expression else { ... }` lowers to a normal `const` and a nullish check; it evaluates the initializer once. Every failure path must explicitly exit with `return`, `throw`, `break` or `continue`. Existing variables and functions named `guard` remain valid.

```sh
pnpm dev:general  # validation, typed array pipelines, async retry
```

## Scope cleanup

```ts
async function read(path: string) {
  const file = await open(path, 'r');
  defer { await file.close(); }
  return await file.readFile('utf8');
}
```

`defer { ... }` registers cleanup in the nearest explicit block or function body. Reached cleanups run in reverse registration order when the scope exits, including returns, exceptions, and loop exits. Async cleanup uses explicit `await` and finishes before the scope exits. Await resource-dependent work before returning it: `return promise` leaves an async function's scope before that promise settles, just as with native `try/finally`.

The compiler emits a lazy local callback stack and `try/finally`. Each reached cleanup allocates a closure; no stack is allocated if registration is skipped. All registered cleanups run even if one throws; the last cleanup error replaces an earlier body or cleanup error. See [the detailed contract](docs/syntax.md#defer) for capture, exception and control-flow rules. Existing `defer()`, assignments, properties and labels retain JS behavior. The keyword and opening brace must be on the same line.

```sh
pnpm dev:defer  # real file handles and temporary-directory cleanup
```

## Components without configuration or wrappers

```ts
// App.twillx — import real components directly.
import { VStack, Text, Button } from '@swiftuijs/ui';

export function App() {
  return VStack({ spacing: 12 }) {
    Text({ key: 'greeting' }) { 'Hello' };
    Button({ key: 'save', onClick: () => console.log('clicked') }) { 'Save' };
  };
}
```

The empty argument list is optional: `map { value in value * 2 }` and `map() { value in value * 2 }` have the same behavior. Generic calls also work without it: `map<number> { value in value * 2 }`.

No `twill.config.json`, component-name list or adapter binding is needed. In `.twillx`, an uppercase component name (including `UI.Card`) followed by a trailing closure is component syntax, just like uppercase JSX tags. Props are an optional single object; a single child is passed directly; multiple child expressions are collected through conditions, loops, switches and try blocks. Native JSX works alongside it. React elements in collected arrays need stable `key` props. A component closure with an `in` parameter header becomes a lazy function child for render-prop APIs, for example `Data { value in <span>{value}</span> }`. Component props and children are checked by the framework’s native JSX types; hooks, memo, classes and refs keep their normal lifecycle.

`.twill` always treats trailing closures as ordinary callbacks, including uppercase functions. In `.twillx`, lowercase callbacks stay ordinary: `items.map { value in value * 2 }`. Parenthesize an uppercase callable to use callback semantics: `(Run) { () in 42 }`. Calls without a trailing closure remain normal calls; use `<Icon />` for a component without child content. This syntax distinction avoids guessing component types or maintaining component registries.

Vue uses lazy default slots, including scoped and named slots:

```ts
// View.twillx
import { defineComponent } from 'vue';
import { Panel } from 'your-vue-library';

export default defineComponent({
  setup() {
    return () => Panel({ title: 'Hello' }) {
      'Content';
    } footer: { 'Footer' };
  },
});
```

The normal `compilerOptions.jsxImportSource` setting in `tsconfig.json` (including `extends`) or a standard `/** @jsxImportSource vue */` file pragma selects the JSX runtime. Without either setting, direct Vue imports select Vue; otherwise React is the default. Set `jsxImportSource: "vue"` in Vue projects whose files import only third-party components, and use `jsx: "react-jsx"` for automatic JSX type checking. A project containing both frameworks can use per-file pragmas. No component registration is required. Vue’s JSX types define its checking limits; Twill does not invent a second prop/slot type system. `.vue` SFC processing remains the host Vue plugin’s responsibility.

Runnable examples:

```sh
pnpm dev:react   # @swiftuijs/ui example
pnpm dev:vue     # independent Vue components
pnpm example:check
```

## Build tools and Node

The default exports under `/vite`, `/rollup`, `/esbuild`, `/webpack`, and `/rspack` share the same options and are tested with real builds. Place the plugin before consumers that parse source syntax. They lower types and JSX and compose source maps.

```ts
import twill from '@swiftuijs/twill/esbuild';
await build({ entryPoints: ['src/main.twill'], bundle: true, plugins: [twill()] });
```

Plugin options override `twill.config.json`: `implicitReturn`, `jsxImportSource`, `root`, `sourceType`, `resolveExtensions`, and `nativeSources`. Relative extensionless imports search native sources before Twill sources, including directory indexes; use explicit extensions when names would be ambiguous. Explicit existing paths and bare packages remain with the host resolver.

Node can load extended ESM files directly:

```sh
node --enable-source-maps --import @swiftuijs/twill/register src/main.twill
```

The loader is opt-in, erases TypeScript types in Twill and local native ESM sources, and composes inline source maps. Type checking remains `twill check`. For JSX emitted by the loader, provide the React JSX runtime; Vue examples use `h()` and slots instead.

Inspect generated code, or write code and a map:

```sh
npx twill compile src/main.twill
npx twill compile src/main.twill --js -o generated/main.js
```

The single-file compile command preserves import specifiers; use a bundler for standalone distribution.

## Editor

```sh
pnpm editor:package
code --install-extension dist/twill.vsix
```

VS Code supports syntax highlighting, TypeScript diagnostics, hover, contextual member/React prop completion, signature help, definitions, automatic imports, cross-file rename, import organization and mapped quick fixes. Completion and edits use original Twill coordinates, including unsaved mixed projects. The extension bundles its language tooling; it does not require a globally installed compiler.

The extension reads the nearest `tsconfig.json` and `twill.config.json`. It recovers common incomplete member expressions while typing; builds always reject invalid syntax. A bundled TS-server bridge supplies diagnostics, hover, completion, signatures and definitions to native TS/JS documents in configured mixed projects. Unsaved Twill and native changes are synchronized, and definitions map back to original files. The extension bundles standard-library declarations for its standalone checker. Use `twill check` for authoritative project checks. Rename and import organization also map edits from native TS/JS back into Twill. Edits that cannot be safely represented in the original syntax are withheld. Formatting, general refactoring/fix-all and React Fast Refresh integration remain future work.

`Twill: Show Generated TypeScript` opens lowered source; `Twill: Show Project Diagnostics` opens a diagnostic report. `Twill: Debug Current File` starts the built-in Node debugger using source maps and the installed `@swiftuijs/twill/register` loader. Install the compiler in your application before debugging. You can also run `npx twill doctor -p tsconfig.json --json` for a scriptable configuration and diagnostics report.

The packaged VSIX is tested in a real VS Code extension host, including completion edits, imports, mixed-file rename, quick fixes and breakpoints on original Twill lines.

TextMate grammars in `editors/vscode/syntaxes` can be reused by other editors that supply TypeScript/JavaScript base grammars. This repository's `.gitattributes` selects TypeScript/TSX highlighting on GitHub. See [GitHub integration](docs/github.md) to enable it in other repositories and understand the requirements for official Twill recognition.

## Performance and language direction

Ordinary closures become native arrow functions; guards become native branches and bindings. They add no runtime helpers. Tests compare minified output with equivalent handwritten JS. Single-expression React children are direct JSX values; general child collection uses arrays and may use an IIFE, while Vue slots remain lazy. UI uses the framework's normal JSX runtime; `defer` uses a local callback stack. These costs are explicit and measured, rather than presented as zero overhead.

The compiler adds build-time work. It parses the dialect, emits high-resolution maps, and erases types/lowers JSX when necessary. Plain JS skips the TS transpilation stage. Parser classes, source-map decoding, and unchanged editor snapshots are reused; completion documentation resolves on selection rather than for every suggestion.

See [measured results and methodology](docs/performance.md) and [language design / Swift feature decisions](docs/language.md). Twill implements trailing closures, single-expression closure returns, guards, nullish bindings, automatic UI child collection and `defer`. If/switch expressions and shorthand parameters remain design candidates. JS/TS supplies optional chaining, nullish coalescing, async/await and types already.

See [readiness and remaining work](docs/readiness.md) for current editor boundaries, performance gaps and the priorities before a stable production claim.

```sh
pnpm build
pnpm benchmark --output benchmark-results.json
```

## Development and release

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:coverage
```

Checks cover syntax execution, TS/JSX compatibility, mappings, type inference, incomplete-editor input, all five bundlers, framework rendering, independently installed npm tarballs, Node loading, and VSIX packaging. CI repeats them on Linux, Windows, and macOS. See [architecture](docs/architecture.md), [contributing](CONTRIBUTING.md), and [release instructions](docs/releasing.md).

MIT licensed. Ordinary Twill code has no React/Vue runtime dependency. UI output imports the selected standard JSX runtime.
