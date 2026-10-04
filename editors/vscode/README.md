# Twill

The Twill JS/TS syntax-sugar language in `.twill` and `.twillx` files: Swift-style trailing closures, early-exit guards, nullish bindings, block-scoped defer and natural component children and lazy slots in UI files. Both dialect formats accept JS syntax with optional types; native JS retains JS/JSDoc checking. Configuration is `twill.config.json`; no legacy names or suffixes are registered.

```ts
const doubled = [1, 2, 3].map { value in value * 2 };
function scoreOf(input: { score: number } | undefined) {
  guard const score = input?.score else { return 0; }
  return score;
}
```

Includes highlighting, bracket/comment support, TypeScript diagnostics, hover, contextual member and React prop completion, signature help, go-to-definition, automatic imports, cross-file rename, import organization and safe quick fixes. Edits target original source and preserve trailing syntax and React shorthand prop bindings.

Use the build plugin and `twill check` from [`@swiftuijs/twill`](https://github.com/swiftuijs/twill). This extension bundles its compiler tooling. Project settings come from the nearest `tsconfig.json` and `twill.config.json`.

Import components directly in `.twillx` and write `Card { "Hello" }`. Uppercase component closures compile to native JSX, with no component lists or wrapper APIs. Normal JSX settings choose the framework; Vue receives lazy default and named slots. `.twill`, lowercase UI calls and parenthesized UI callables retain ordinary callback semantics.

The bundled TS-server bridge supports native TS/JS documents importing Twill in configured projects, including diagnostics, hover, completion, signatures, definitions and unsaved-source synchronization. Standard-library declarations are included for standalone Twill assistance. The bridge also maps native TS/JS rename and import edits into Twill. Syntax is experimental; formatting, general refactoring/fix-all and lint integration remain future work. Edits that cannot be safely mapped are withheld. Use the CLI for authoritative whole-project checking. See the repository's [syntax contract](https://github.com/swiftuijs/twill/blob/main/docs/syntax.md) for details.

React props and callbacks use native JSX types, but completion of partially typed shorthand prop names is incomplete. See [readiness and editor boundaries](https://github.com/swiftuijs/twill/blob/main/docs/readiness.md). Installing this extension does not change GitHub highlighting; use the repository attributes described in [GitHub integration](https://github.com/swiftuijs/twill/blob/main/docs/github.md).

**Twill: Show Generated TypeScript** opens compiled source alongside the document. **Twill: Show Project Diagnostics** opens a JSON configuration/diagnostics report. **Twill: Debug Current File** starts the built-in Node debugger with source maps; install `@swiftuijs/twill` in your application so its loader can be resolved. Breakpoints and stack frames refer to original Twill lines. Browser and framework debugging continue to use their existing tools.

Build at the repository root with `pnpm install --frozen-lockfile && pnpm editor:package`; install `dist/twill.vsix`. The pnpm workspace uses Vite library builds for both editor bundles. `pnpm editor:test` tests the extracted VSIX in a real VS Code extension host; use `xvfb-run -a pnpm editor:test` on headless Linux. CI tests VS Code 1.95.3 and stable.
