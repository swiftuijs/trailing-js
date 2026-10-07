# Changelog

## Unreleased

- Refresh build-adapter configuration at build boundaries and track project/inherited JSX config dependencies for real Rollup, Webpack, Rspack and esbuild watch/incremental workflows. Preserve host-native emission and adapter-option precedence; verify failed builds recover with original-source maps.
- Document the five published adapter imports, tested host versions and development-mode boundaries in READMEs, the website and the official AI skill. The configuration-refresh fix is not published in 0.1.2.

- Prototype accepted RFC 0018 `if const` nullish branch bindings with one evaluation, native object/array destructuring and success-only immutable scope. Follow Swift's condition boundary, retaining grouped/nested trailing closures and unchanged native `if (...)` behavior.
- Lower branch bindings to native scoped const/if code without a wrapper, closure, promise or runtime import. Synchronize mapped checking/editing, formatter/standalone, ESLint, TS/TSX grammars, declarations/export, build/loader/browser consumers, packaged editor, playground, documentation and the official AI skill.

- Add the official portable Twill AI skill, published-feature guidance and executable examples; generate website downloads and discovery metadata from one canonical source.
- Add repository `AGENTS.md` conventions and skill synchronization requirements, with release/example checks in CI and website installation/use documentation. No language output or npm/Marketplace version changes.

- Add accepted, unreleased `match` expressions with qualified enum-case descriptors and named payload bindings. Keep ordinary switch calls, native statement fallthrough and the earlier explicit-marker spelling compatible; match and switch expressions never fall through.

- Prototype RFC 0032 optional versioned runtime helpers: default inline emission and explicit external sharing for dynamic synchronous defer. Generate the inline algorithm from the canonical zero-dependency runtime source; preserve async scheduling and native fast paths.
- Keep external helper imports before complete adjacent declaration documentation and suppression blocks, preserving file pragmas and native checkJs annotations.
- Synchronize compiler/config schemas, CLI, build/loader/editor projects, native export/declarations, documentation and package/release verification. Fix compact final-defer insertion order and preserve headers/directives when inserting helper imports.

- Lower standalone switch-expression identifier initializers to native branches without an IIFE, retaining binding semantics, result inference and mapped editor operations. Add semantic regression tests and an 8-byte checked application budget.

- Prototype RFC 0016 explicit enum-case patterns: `case enum State.loaded({ value })`. Check qualified local/imported/native descriptors and narrowed bindings; retain native call-value cases and exhaustiveness. The preferred syntax is now an accepted `match` expression; the explicit marker stays compatible and release remains pending.
- Select enum patterns with one subject/tag read, native scoped destructuring and no factory lookup or matching runtime. Preserve native defaults/rest, throw, await/defer and nested switch behavior; enforce a 2-byte direct bundle budget against handwritten JS.
- Synchronize formatter, typed linting, shared TS/TSX highlighting, source maps, native export/declarations, builds/loader, playground and packaged editor. Withhold unsafe descriptor method rename and native statement-case lint suggestions in switch expressions.

- Implement accepted associated-value enums with named typed payloads, generic factory inference and native readonly tagged-union types. Preserve ordinary TypeScript enums and reuse existing checked object-pattern switches.
- Preserve copied enum type annotations in source/declaration maps; support original-source formatting, mapped linting, shared TS/TSX highlighting, constructor completion, native declarations, Node/build integration and checked source export.
- Withhold enum declaration/case/payload/type-parameter rename until edits to generated types and discriminator tags can be proven complete. Explicit enum patterns are prototyped separately under RFC 0016.

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
