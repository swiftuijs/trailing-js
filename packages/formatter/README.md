# <img src="https://twill.evecalm.com/logo.png" alt="Twill hummingbird" align="right" width="40" height="40" /> Twill formatter

Prettier 3.9 plugin for Twill, a TypeScript-based language with Swift-inspired syntax extensions. Formats `.twill`, `.twillx` and native TS/TSX while preserving trailing closures, guards and defer. It uses Prettier's own TypeScript parser/printer; compilation helpers never enter formatted source.

Install in your application:

```sh
pnpm add -D @swiftuijs/twill-formatter prettier
```

`.prettierrc.json`:

```json
{ "plugins": ["@swiftuijs/twill-formatter"], "singleQuote": true }
```

```sh
pnpm exec prettier --write 'src/**/*.{twill,twillx,ts,tsx,js}'
pnpm exec prettier --check .
```

The API `format(source, { filepath: 'view.twillx' })` returns a promise. The default export is a standard Prettier plugin. Ordinary TS/JS keeps its normal Prettier parser. Explicit parentheses around component-like callees are retained because they affect Twill semantics. Invalid source fails formatting with a syntax diagnostic.

The VSIX bundles this formatter and supports Format Document and format-on-save without a separate Prettier extension. Its built-in provider uses editor indentation and Prettier defaults. Use the standard Prettier extension with this workspace plugin when you need project-wide Prettier configuration.

For generated-source viewers, `formatGenerated(code, { filepath: 'output.ts' })` formats native TS/TSX directly. Use `output.tsx` for JSX. It returns display text without a source map; retain the original compiler result for builds, diagnostics and debugger mappings. `format()` remains the dialect-source formatter.

Browser workers and the VSIX use `@swiftuijs/twill-formatter/standalone`. It exposes the same formatting helpers and loads only Prettier's core, the TS/ESTree support and the Twill plugin. Additional plugins must be loaded objects; this entry does not resolve plugin filenames or load configuration from disk. The main entry retains ordinary Node Prettier integration. Both entries are tested for matching formatting and idempotence.

[Documentation](https://twill.evecalm.com/tooling) · [Issues](https://github.com/swiftuijs/twill/issues) · MIT licensed · Built by [forth.ink](https://forth.ink).

## Unreleased language work

Unreleased source work includes associated-value enums and accepted `match` expressions: `match (state) { case State.loaded({ value }): value; default: 0; }`. Named payload bindings and erased factory descriptors compile to native switches without calling factories. Native switch statements retain JS fallthrough; match and switch expressions return one result without fallthrough. These additions are not included in npm/Marketplace 0.1.2. Compiler, formatter, linter, highlighter, export and editor changes are validated together. See [syntax and compatibility](https://twill.evecalm.com/syntax#match-expressions-unreleased) and [RFC 0016](https://github.com/swiftuijs/twill/blob/main/docs/rfcs/0016-pattern-matching.md).
