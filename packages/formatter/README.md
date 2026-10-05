# Twill formatter

Prettier 3.9 plugin for `.twill` and `.twillx`. Formats native TS/TSX and preserves trailing closures, guards and defer. It uses Prettier's own TypeScript parser/printer; compilation helpers never enter formatted source.

```sh
pnpm add -D @swiftuijs/twill-formatter prettier
```

`.prettierrc.json`:

```json
{ "plugins": ["@swiftuijs/twill-formatter"], "singleQuote": true }
```

```sh
pnpm prettier --write 'src/**/*.{twill,twillx,ts,tsx,js}'
pnpm prettier --check .
```

The API `format(source, { filepath: 'view.twillx' })` returns a promise. The default export is a standard Prettier plugin. Ordinary TS/JS keeps its normal Prettier parser. Explicit parentheses around component-like callees are retained because they affect Twill semantics. Invalid source fails formatting with a syntax diagnostic.

The VSIX bundles this formatter and supports Format Document and format-on-save without a separate Prettier extension. Its built-in provider uses editor indentation and Prettier defaults. Use the standard Prettier extension with this workspace plugin when you need project-wide Prettier configuration.

For generated-source viewers, `formatGenerated(code, { filepath: 'output.ts' })` formats native TS/TSX directly. Use `output.tsx` for JSX. It returns display text without a source map; retain the original compiler result for builds, diagnostics and debugger mappings. `format()` remains the dialect-source formatter.
