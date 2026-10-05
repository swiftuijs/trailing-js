# Twill

The Twill JS/TS syntax-sugar language in `.twill` and `.twillx` files: Swift-style trailing closures, early-exit guards, nullish bindings, block-scoped defer and natural component children and lazy slots in UI files. Both dialect formats accept JS syntax with optional types; native JS retains JS/JSDoc checking. Your normal `tsconfig.json` supplies project settings; no `twill.config.json` is required.

```ts
const doubled = [1, 2, 3].map { value in value * 2 };
function scoreOf(input: { score: number } | undefined) {
  guard const score = input?.score else { return 0; }
  return score;
}
```

Includes highlighting, bracket/comment support, TypeScript diagnostics, hover, contextual member and React prop completion, signature help, go-to-definition, automatic imports, cross-file rename, import organization and safe quick fixes. Edits target original source and preserve trailing syntax and React shorthand prop bindings.

Use the build plugin and `twill check` from [`@swiftuijs/twill`](https://github.com/swiftuijs/twill). This extension bundles its compiler tooling. Project types and JSX settings come from the normal `tsconfig.json`; optional language overrides may be supplied in `twill.config.json`.

Import components directly in `.twillx` and write `Card { "Hello" }`. Uppercase component closures compile to native JSX, with no component lists or wrapper APIs. Normal JSX settings choose the framework; Vue receives lazy default and named slots. `.twill`, lowercase UI calls and parenthesized UI callables retain ordinary callback semantics.

The bundled TS-server bridge supports native TS/JS documents importing Twill in configured projects, including diagnostics, hover, completion, signatures, definitions, references and unsaved-source synchronization. Standard-library declarations are included for standalone Twill assistance. The bridge also maps native TS/JS rename and import edits into Twill. Syntax is experimental. Document formatting uses the bundled Prettier plugin; lint integration uses the configured ESLint package. General refactoring and fix-all are unavailable. Edits that cannot be safely mapped are withheld. Use the CLI for authoritative whole-project checking. See the repository's [syntax contract](https://github.com/swiftuijs/twill/blob/main/docs/syntax.md) for details.

React props and callbacks use native JSX types. Common incomplete shorthand input supports completion; arbitrary malformed syntax may interrupt assistance. See [readiness and editor boundaries](https://github.com/swiftuijs/twill/blob/main/docs/readiness.md). Installing this extension does not change GitHub highlighting; use the repository attributes described in [GitHub integration](https://github.com/swiftuijs/twill/blob/main/docs/github.md).

**Twill: Show Generated TypeScript** opens compiled source alongside the document. **Twill: Show Project Diagnostics** opens a JSON configuration/diagnostics report. **Twill: Debug Current File** starts the built-in Node debugger with source maps; install `@swiftuijs/twill` in your application so its loader can be resolved. Breakpoints and stack frames refer to original Twill lines. Browser and framework debugging continue to use their existing tools.

## Install and configure

Download the reviewed `twill.vsix` from the `twill-packages` artifact of a successful [CI run](https://github.com/swiftuijs/twill/actions/workflows/ci.yml), then use **Extensions → Install from VSIX**. Open your application folder and include Twill files in its tsconfig. If a native TS/JS project was already open, run **TypeScript: Restart TS Server**.

See [getting started](https://swiftuijs.github.io/twill/getting-started) for compiler installation and [editor and tooling](https://swiftuijs.github.io/twill/tooling) for format-on-save, linting, quality checks and debugging.

Document formatting is bundled through `@swiftuijs/twill-formatter`. Format Document and format-on-save preserve Twill syntax and typed closure headers; the provider follows editor indentation and Prettier defaults. To use workspace Prettier configuration, install the standard Prettier extension with the formatter plugin. ESLint rules are supplied by the independent `@swiftuijs/twill-linter` package and Microsoft's ESLint extension; validate the `twill-typescript` and `twill-tsx` language IDs.

The extension includes the compiler, formatter and TypeScript assistance needed for editing. Your application supplies its own framework dependencies and the compiler package used for builds, whole-project checks and source execution.
