# Twill

**Twill** is a general-purpose syntax-sugar language built on JavaScript and TypeScript. It borrows concise syntax from Swift and compiles to ordinary JS/TS, with source maps, build plugins, a type checker, and a VS Code extension. Data processing, Node services, async workflows and UI code use the same language.

```ts
const doubled = [1, 2, 3].map() { value in value * 2 };
// → [1, 2, 3].map((value) => { return value * 2; });
```

The compiler is framework-independent. Optional React and Vue adapters bridge closures to children and slots. `@swiftuijs/ui` is one example consumer; there are no component-library names or imports built into the compiler.

This is an experimental **0.4 language**, with production-oriented packaging and tests. See [the syntax contract and limitations](docs/syntax.md) before adopting it. Until published to npm and the Marketplace, install a locally built tarball and VSIX.

## Quick start

The distributed package requires Node **20.19+ or 22.12+** and is ESM. Use **Node 22.12+** to develop the repository or rebuild the editor extension; its test and VSIX tools require Node 22.

```sh
git clone https://github.com/swiftuijs/twill.git
cd twill
npm ci
npm run build
npm pack
# In your application:
npm install /path/to/swiftuijs-twill-0.4.0.tgz
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
| `.twill.js`      | JavaScript    |
| `.twill.jsx`     | JSX           |

Standard `.ts`, `.tsx`, `.js` and `.jsx` files retain their normal language. Plain-JS dialect files retain JS/JSDoc checking and skip type erasure.

```ts
// main.twill
const values: number[] = [1, 2, 3];
export const doubled = values.map() { value in value * 2 };
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
export const doubled = [1, 2, 3].map() { value in twice(value) };

// consumer.ts (or consumer.js without the annotation)
import { doubled } from './math.twill';
const result: number[] = doubled;
```

Use the Twill build plugin, `twill check`, and the VSIX for a mixed project. Vite/esbuild retain their native TS pipeline; bare Rollup/webpack/rspack receive standard TS/TSX/JSX emission by default. Set `nativeSources: false` when another plugin owns that emission. Native files never use Twill parsing or implicit-return rules. npm dependencies retain their host's handling.

```sh
npm run dev:mixed     # JS → TS → Twill → TS/JS, with exported types and dynamic imports
npx twill check -p tsconfig.json
node --enable-source-maps --import @swiftuijs/twill/register src/main.js
```

The opt-in Node loader compiles local ESM `.ts`, `.mts`, `.tsx` and `.jsx` as well as Twill, including on Node 20. Standard JS/CJS keeps Node handling. See [interoperability](docs/interoperability.md) for resolution rules, editor setup and CommonJS boundaries. Plain `tsc` does not understand Twill source; TS-server plugins provide editor assistance, rather than changing the command-line compiler.

## Closures

```ts
run { console.log('hello'); };           // no ordinary arguments
items.map() { item in item.name };       // a single expression returns its value
items.map() { (item: Item) in item.id };  // typed / destructured / default / rest params
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
npm run dev:general  # validation, typed array pipelines, async retry, non-UI builder
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
npm run dev:defer  # real file handles and temporary-directory cleanup
```

## Explicit builders (data or UI)

Builders also construct query fragments, lists and other ordinary data; see `examples/general`. Explicitly opt callee names into expression collection in `twill.config.json`:

```json
{ "builders": ["Stack", "Text", "Button"] }
```

Ordinary callbacks remain ordinary callbacks. A builder closure collects expression statements, including expressions inside `if`, loops, `switch`, and `try`. Declarations keep their normal behavior; nested functions get their own scope.

```ts
// Any React component library:
import { components } from '@swiftuijs/twill/react';
import { Stack as ReactStack, Text as ReactText, Button as ReactButton } from 'your-library';

const { Stack, Text, Button } = components({
  Stack: ReactStack, Text: ReactText, Button: ReactButton,
});

export function App() {
  return Stack({ spacing: 12 }) {
    Text({ key: 'greeting' }) { 'Hello' };
    Button({ key: 'save', onClick: () => console.log('clicked') }) { 'Save' };
  };
}
```

Use the same `components()` API from `@swiftuijs/twill/vue` for Vue components. The Vue adapter supplies a **lazy default slot**, preserving reactive tracking. React uses `createElement`, preserving hooks, context, and component identity. Builder children are arrays, so React elements need explicit stable `key` props, including elements collected by loops. Specialized render props and named Vue slots can still be supplied explicitly through props and ordinary framework APIs.

Runnable examples:

```sh
npm run dev:react   # @swiftuijs/ui example
npm run dev:vue     # independent Vue components
npm run example:check
```

## Build tools and Node

The default exports under `/vite`, `/rollup`, `/esbuild`, `/webpack`, and `/rspack` share the same options and are tested with real builds. Place the plugin before consumers that parse source syntax. They lower types and JSX and compose source maps.

```ts
import twill from '@swiftuijs/twill/esbuild';
await build({ entryPoints: ['src/main.twill'], bundle: true, plugins: [twill()] });
```

Plugin options override `twill.config.json`: `builders`, `implicitReturn`, `root`, `sourceType`, `resolveExtensions`, and `nativeSources`. Relative extensionless imports search native sources before Twill sources, including directory indexes; use explicit extensions when names would be ambiguous. Explicit existing paths and bare packages remain with the host resolver.

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
npm run editor:package
code --install-extension dist/twill.vsix
```

VS Code supports syntax highlighting, comments, brackets, TypeScript diagnostics, hover, member completion, signature help, and go-to-definition in extended files. `Twill: Show Generated TypeScript` opens the lowered source beside your document. The extension bundles its language tooling; it does not require a globally installed compiler.

The extension reads the nearest `tsconfig.json` and `twill.config.json`. It recovers common incomplete member expressions while typing; builds always reject invalid syntax. A bundled TS-server bridge supplies diagnostics, hover, completion, signatures and definitions to native TS/JS documents in configured mixed projects. Unsaved Twill and native changes are synchronized, and definitions map back to original files. The extension bundles standard-library declarations for its standalone checker. Use `twill check` for authoritative project checks. Formatting, rename across dialect files, automatic imports, and React Fast Refresh integration are not yet provided.

TextMate grammars in `editors/vscode/syntaxes` can be reused by other editors that supply TypeScript/JavaScript base grammars. GitHub's Linguist does not recognize these new extensions automatically.

## Performance and language direction

Ordinary closures become native arrow functions; guards become native branches and bindings. They add no runtime helpers. Tests compare minified output with equivalent handwritten JS. Builders allocate arrays and push values; `defer` uses a local callback stack; optional component adapters perform framework work. These costs are explicit and measured, rather than presented as zero overhead.

The compiler adds build-time work. It parses the dialect, emits high-resolution maps, and erases types/lowers JSX when necessary. Plain JS skips the TS transpilation stage. Parser classes, source-map decoding, and unchanged editor snapshots are reused; completion documentation resolves on selection rather than for every suggestion.

See [measured results and methodology](docs/performance.md) and [language design / Swift feature decisions](docs/language.md). Twill implements trailing closures, single-expression closure returns, guards, nullish bindings, explicit result builders and `defer`. If/switch expressions and shorthand parameters remain design candidates. JS/TS supplies optional chaining, nullish coalescing, async/await and types already.

```sh
npm run build
npm run benchmark -- --output benchmark-results.json
```

## Development and release

```sh
npm ci
npm run check
npm run test:coverage
```

Checks cover syntax execution, TS/JSX compatibility, mappings, type inference, incomplete-editor input, all five bundlers, framework rendering, independently installed npm tarballs, Node loading, and VSIX packaging. CI repeats them on Linux, Windows, and macOS. See [architecture](docs/architecture.md), [contributing](CONTRIBUTING.md), and [release instructions](docs/releasing.md).

MIT licensed. No runtime dependency on React or Vue unless its adapter is imported.
