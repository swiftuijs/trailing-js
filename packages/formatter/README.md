# Twill formatter

Prettier 3.9 plugin for `.twill` and `.twillx`. Formats native TS/TSX and preserves trailing closures, guards and defer. It uses Prettier's own TypeScript parser/printer; compilation helpers never enter formatted source.

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

[Documentation](https://swiftuijs.github.io/twill/tooling) · [Issues](https://github.com/swiftuijs/twill/issues) · MIT licensed · Built by [forth.ink](https://forth.ink).
