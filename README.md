# trailing-js

Swift-style trailing closures for JavaScript and TypeScript. A small syntax extension that compiles to ordinary arrow functions, with source maps, build plugins, a type checker, and a VS Code extension.

```ts
const doubled = [1, 2, 3].map() { value in value * 2 };
// → [1, 2, 3].map((value) => { return value * 2; });
```

The compiler is framework-independent. Optional React and Vue adapters bridge closures to children and slots. `@swiftuijs/ui` is one example consumer; there are no component-library names or imports built into the compiler.

This is an experimental **0.1 syntax**, with production-oriented packaging and tests. See [the syntax contract and limitations](docs/syntax.md) before adopting it. **npm and Marketplace publication are separate from repository delivery**; until published, install a locally built tarball and VSIX.

## Quick start

The distributed package requires Node **20.19+ or 22.12+** and is ESM. Use **Node 22.12+** to develop the repository or rebuild the editor extension; its test and VSIX tools require Node 22.

```sh
git clone https://github.com/swiftuijs/trailing-js.git
cd trailing-js
npm ci
npm run build
npm pack
# In your application:
npm install /path/to/swiftuijs-trailing-js-0.1.0.tgz
```

In Vite:

```ts
import { defineConfig } from 'vite';
import trailing from '@swiftuijs/trailing-js/vite';

export default defineConfig({ plugins: [trailing()] });
```

Write extended code in `.tts` (TypeScript) or `.tjs` (JavaScript). Use `.ttsx` / `.tjsx` when the file contains JSX. Standard `.ts`, `.tsx`, `.js` and `.jsx` files retain their normal language.

```ts
// main.tts
const values: number[] = [1, 2, 3];
export const doubled = values.map() { value in value * 2 };
```

Run type checking separately from bundling:

```sh
npx trailing-js check -p tsconfig.json
```

Include the extended files in your `tsconfig.json`, for example `"include": ["src/**/*"]`. The checker reads your real TypeScript settings, infers callback types, resolves explicit and extensionless local imports, and maps errors back to the original files. Ordinary `tsc` does not parse this syntax.

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

## Component builders

Explicitly opt callee names into child collection in `trailing.config.json`:

```json
{ "builders": ["Stack", "Text", "Button"] }
```

Ordinary callbacks remain ordinary callbacks. A builder closure collects expression statements, including expressions inside `if`, loops, `switch`, and `try`. Declarations keep their normal behavior; nested functions get their own scope.

```ts
// Any React component library:
import { components } from '@swiftuijs/trailing-js/react';
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

Use the same `components()` API from `@swiftuijs/trailing-js/vue` for Vue components. The Vue adapter supplies a **lazy default slot**, preserving reactive tracking. React uses `createElement`, preserving hooks, context, and component identity. Builder children are arrays, so React elements need explicit stable `key` props, including elements collected by loops. Specialized render props and named Vue slots can still be supplied explicitly through props and ordinary framework APIs.

Runnable examples:

```sh
npm run dev:react   # @swiftuijs/ui example
npm run dev:vue     # independent Vue components
npm run example:check
```

## Build tools and Node

The default exports under `/vite`, `/rollup`, `/esbuild`, `/webpack`, and `/rspack` share the same options and are tested with real builds. Place the plugin before consumers that parse source syntax. They lower types and JSX and compose source maps.

```ts
import trailing from '@swiftuijs/trailing-js/esbuild';
await build({ entryPoints: ['src/main.tts'], bundle: true, plugins: [trailing()] });
```

Plugin options override `trailing.config.json`: `builders`, `implicitReturn`, `root`, `sourceType`, and `resolveExtensions`. Relative extensionless imports search the four trailing extensions; keep imports explicit when names would be ambiguous. Vite also supports trailing extensions through its standard resolver.

Node can load extended ESM files directly:

```sh
node --enable-source-maps --import @swiftuijs/trailing-js/register src/main.tts
```

The loader is opt-in, erases TypeScript types, and composes inline source maps. Type checking remains `trailing-js check`. For JSX in Node, provide the React JSX runtime; Vue examples use `h()` and slots instead.

Inspect generated code, or write code and a map:

```sh
npx trailing-js compile src/main.tts
npx trailing-js compile src/main.tts --js -o generated/main.js
```

The single-file compile command preserves import specifiers; use a bundler for standalone distribution.

## Editor

```sh
npm run editor:package
code --install-extension dist/trailing-js.vsix
```

VS Code supports syntax highlighting, comments, brackets, TypeScript diagnostics, hover, member completion, signature help, and go-to-definition in extended files. `Trailing JS: Show Generated TypeScript` opens the lowered source beside your document. The extension bundles its language tooling; it does not require a globally installed compiler.

The extension reads the nearest `tsconfig.json` and `trailing.config.json`. It recovers common incomplete member expressions while typing; builds always reject invalid syntax. The standard TS server is not patched: use `trailing-js check` for the full project's authoritative diagnostics, including ordinary TS files importing extended files. Formatting, rename, automatic imports, and React Fast Refresh integration are not yet provided.

TextMate grammars in `editors/vscode/syntaxes` can be reused by other editors that supply TypeScript/JavaScript base grammars. GitHub's Linguist does not recognize these new extensions automatically.

## Development and release

```sh
npm ci
npm run check
npm run test:coverage
```

Checks cover syntax execution, TS/JSX compatibility, mappings, type inference, incomplete-editor input, all five bundlers, framework rendering, independently installed npm tarballs, Node loading, and VSIX packaging. CI repeats them on Linux, Windows, and macOS. See [architecture](docs/architecture.md), [contributing](CONTRIBUTING.md), and [release instructions](docs/releasing.md).

MIT licensed. No runtime dependency on React or Vue unless its adapter is imported.
