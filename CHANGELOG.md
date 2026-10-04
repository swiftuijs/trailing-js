# Changelog

## 0.6.0

Move development into a pnpm workspace monorepo with Vite/Rolldown library builds. The public compiler/toolchain lives in `packages/twill`; the VSIX and its private TS-server bridge build as dependent workspaces. The public package remains `@swiftuijs/twill`, and the only dialect extensions remain `.twill` / `.twillx`. Compiler declarations use Vite's declaration plugin; all published bundles target Node 20 while repository tools use Node 22+.

Improve real editing workflows: partially typed React prop keys, contextual callback completion, automatic imports, cross-file rename in mixed TS/JS/Twill projects, shorthand/quoted prop preservation, import organization and mapped quick fixes. Unmappable generated edits are withheld. Per-file disk refresh retains unrelated transforms and unsaved overlays; project configuration changes reset affected projects.

Add `twill doctor`, project-information and generated-source views, and a Node debugging command with original-source breakpoints. Real VS Code extension-host tests exercise the packaged VSIX, unsaved mixed-file edits and source-map debugging; CI covers minimum and stable VS Code versions alongside cross-platform compiler/package checks. Formatting, lint integration, general refactoring/fix-all and user-library declaration/project-reference builds remain future work.

## 0.5.0

Natural `.twillx` component closures compile directly to native JSX. Real components are imported and used directly, without component lists, aliases or Twill wrapping functions. React preserves hooks, memo, class identity, refs and native JSX prop/children checking. Vue preserves lazy reactive slots, supports scoped/named slots and rejects duplicate slot names. The standard JSX import source and inherited tsconfig settings select the runtime; direct Vue imports also select Vue when unspecified.

Only `.twill` and `.twillx` remain source extensions; JS-ending dialect extensions and the unpublished React/Vue wrapper APIs are removed without compatibility aliases. Both formats accept JS syntax with optional types, and native JS/JSDoc and TS sources retain bidirectional mixed imports. `builders` is removed from configuration. Ordinary `.twill` calls and parenthesized UI callable expressions retain function semantics. Documentation and examples use `.map { value in ... }` without empty parentheses and explain component/callback boundaries. Single children retain their original value and type, including single-element slot/asChild APIs. Literal React props become native JSX attributes with explicit keys and contextual callback types. Real-framework rendering, prop diagnostics, generic components, child collection/defer composition and extended JSX settings are verified.

## 0.4.0

Adds end-to-end native TS/JS ↔ Twill imports: all five bundlers, exported types, JSDoc consumers, type-only imports, re-exports, dynamic imports, cycles and native-first extensionless/index resolution. Vite/esbuild reuse host compilation; bare Rollup/webpack/rspack can emit local native TS/TSX/JSX with an explicit opt-out. Native source never runs through the dialect parser. The ESM loader emits local native TS/TSX/JSX on supported Node versions and preserves native source maps, while delegating JS/CJS and dependencies to Node.

A bundled TS-server plugin supplies types, diagnostics and mapped navigation in native TS/JS documents. Unsaved source is synchronized and unchanged snapshots retained. Standard-library declarations are now included for standalone editor checking. The npm package main serves TS server's CommonJS loading; compiler ESM exports are unchanged. Independent installs and the extracted VSIX are exercised through real TS-server requests. A mixed application demonstrates the complete graph. Imported local files are checked even outside include globs; formatting, cross-dialect rename, project-reference builds and declaration emission remain incomplete.

## 0.3.0

The pre-publication product is named Twill. Repository `swiftuijs/twill`, package `@swiftuijs/twill`, CLI `twill`, configuration `twill.config.json`, and extensions `.twill`, `.twillx`, `.twill.js`, `.twill.jsx` replace the provisional names without compatibility aliases. Public compiler/project names are `TwillSyntaxError`, `isTwillFile` and `TwillProject`.

Adds contextual block-scoped `defer`, lazy registration stacks, reverse-order cleanup on all exits, serial explicit async cleanup, continued cleanup after errors, lexical captures, hygienic variables, mapped diagnostics and highlighting. Function-body hoisting, strict directives, JS parameter aliases and JSDoc are preserved. Module-level cleanup and direct function-body overloads with defer produce explicit diagnostics. A real file-handle example exercises async cleanup through the Node loader.

Mixed native TS and Twill JS projects retain correct JS/JSDoc language semantics. All five bundlers, independent package installation, loader, editor grammar and project checks cover defer. Derived-class parsing and the pinned TS parser's override false positive are fixed. Runtime cleanup benchmarks document allocation and dispatch costs alongside build measurements.

## 0.2.0

Twill is now documented as a general-purpose JS/TS syntax-sugar language. Adds `guard … else` and nullish `guard const` bindings, conservative exit validation, TS narrowing, mapped diagnostics, and highlighting. A non-UI example covers validation, array pipelines, async retry and data builders.

Compiler improvements reuse parser classes, index parameter locations, avoid unnecessary AST walks, reuse source-map decoders and bypass TS transpilation for plain JS. Editor improvements retain unchanged overlays and per-file semantic snapshots, cache line indexes and resolve completion details lazily. Reproducible build benchmarks, runtime code-identity tests and CI benchmark artifacts document performance without imposing hardware-dependent timing limits.

The language design records which Swift features are implemented and which need further scope/runtime design. `defer`, expression if/switch and shorthand parameters are not implemented.

## 0.1.0

Initial experimental implementation: JS/TS trailing closures, typed and async headers, single-expression returns, positional multiple closures, explicit child builders, source maps, five build adapters, opt-in Node loading, virtual TypeScript project checking, framework-independent React/Vue helpers, runnable examples, and a VS Code extension with highlighting and semantic assistance.
