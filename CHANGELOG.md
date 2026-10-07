# Changelog

## Unreleased

- Implement accepted associated-value enums with named typed payloads, generic factory inference and native readonly tagged-union types. Preserve ordinary TypeScript enums and reuse existing checked object-pattern switches.
- Preserve copied enum type annotations in source/declaration maps; support original-source formatting, mapped linting, shared TS/TSX highlighting, constructor completion, native declarations, Node/build integration and checked source export.
- Withhold enum declaration/case/payload/type-parameter rename until edits to generated types and discriminator tags can be proven complete. Broader enum pattern syntax remains a separate RFC.

## 0.1.2

- Clarify Twill's TypeScript/TSX foundation, Swift-inspired syntax extensions and current parser/ambiguity compatibility boundaries.
- Refresh package and Marketplace READMEs with the TypeScript-based positioning and sibling-project homepage links.
- Load native TypeScript/TSX dependencies before Twill grammars in VitePress, restoring ordinary keyword, operator and JSX colors in documentation examples.
- Retain native logical/nullish operators and optional chains after implicit members such as `.active && .verified` and `.profile?.name ?? 'Anonymous'`.
- Preserve JSX tags and attributes in parameterless TwillX trailing closures; keep JSX text literal while retaining Twill syntax in embedded expressions. Share these fixes between the highlighting package and VS Code grammar.

## 0.1.1

- Introduce Twill's indigo hummingbird identity across the documentation site, VS Code extension and package READMEs.
- Show the logo in the documentation navigation and right-align it within README titles, with coordinated light and dark themes, favicons and Marketplace branding.

## 0.1.0

Initial experimental release of Twill, a JavaScript / TypeScript syntax-sugar language and development toolchain by [forth.ink](https://forth.ink).

### Language

- Trailing closures on ordinary callback APIs, with optional parentheses, typed/async parameters, multiple closures, nesting and single-expression returns.
- First-argument member shorthand such as `users.filter { .active }`, with contextual types and ordinary arrow output.
- Early-exit `guard` statements and nullish `guard const` bindings, including destructuring and native TypeScript narrowing.
- Block-scoped `defer`, with reverse-order cleanup on scope exit and explicit awaited cleanup in async functions.
- Value-producing switch expressions and discriminated-union cases, with exhaustiveness checked by `twill check`.
- `.twill` for TypeScript / JavaScript syntax and `.twillx` for TSX. Component closures use native React children or lazy Vue slots without registration or wrappers.
- Two-way imports with native TS/JS files and optional language configuration through `twill.config.json`.

### Development tools

- Compiler and CLI: `twill compile`, `check`, `doctor`, `declarations` and optional `export`.
- Vite, Rollup, esbuild, webpack and Rspack adapters; a React Vite adapter with Fast Refresh; an opt-in Node ESM loader and source maps.
- VS Code extension with highlighting, TypeScript assistance, original-source diagnostics/navigation, mixed-file rename, safe quick fixes, formatting and Node debugging.
- Independent Prettier and ESLint packages, including optional type-aware linting and source-mapped fixes.
- Optional checked source export to native TS/TSX, and browser/SSR Shiki highlighting with portable TextMate grammars.
- English documentation, a local live compiler playground, ordinary-code and framework examples, and a pinned React client-core source study.

### Compatibility

Compiler consumers require Node 20.19+ or 22.12+. The checker/editor use TypeScript 5.9; the VS Code extension requires 1.95.3 or newer. See the [support matrix](https://twill.evecalm.com/readiness) for integration versions and boundaries. The 0.x language remains experimental; minor releases may change semantics or integration contracts.
