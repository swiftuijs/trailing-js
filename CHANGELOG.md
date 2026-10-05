# Changelog

## 0.9.0

- Add first-argument member shorthand in headerless callback closures, such as `users.filter { .active }`. Preserve contextual types, mapped member assistance and ordinary arrow output without a runtime helper.

- Add destructured nullish guards with native nested/rest/default bindings, source-backed edits and no runtime library. Pattern bindings initialize only after the exiting failure branch.
- Add value-producing switch expressions and discriminated-union object cases. TypeScript checks missing cases; direct returns lower to native switches, other expression positions use a synchronous lexical IIFE. Await/yield inside an expression requires a direct return. Native switch statements retain their semantics.
- Support the syntax across formatting, mapped linting, editor completion/rename/references, source export and standard builds. Include practical workflow and playground examples, strict type and runtime checks, output parity fixtures and a scoped branching benchmark.

## 0.8.0

- Add original-source references across unsaved TS/JS/Twill documents, including native TS-server requests. Share one pinned TypeScript engine on disk between editor hosts and expose a lightweight standalone formatter for browsers and editors.
- Add the optional migration workspace for checked, formatted native TS/TSX source export, with mixed-import rewriting, dry-run and preflight checks. Provide practical validation, resource ownership and typed state examples, an adoption guide and a language-design RFC.
- Enforce compressed artifact budgets and representative native/dialect application byte and behavior parity. Release artifacts include a SHA-256 manifest; each public package is exercised from an independent installation.

- Keep tests, browser fixtures, independent npm consumer verification and their dependencies in the owning workspace packages. Root commands aggregate package suites and coverage reports. Examples own their execution and rendering checks.
- Centralize reviewed tool versions with pnpm catalogs, pin TypeScript semantics and docs compatibility dependencies, remove noisy dependency-update PR automation and refresh GitHub Actions. Dependency checks validate moderate-and-higher advisories and peer constraints.

Add an independent `apps/docs` VitePress workspace with shared reference sources, English guides, local search, Twill highlighting and an actual compiler playground in a disposable browser worker. GitHub Pages builds and desktop/mobile browser checks validate the site without running submitted code. Pin the stable documentation framework to patched Vite 6, with a dependency audit gate and peer-constraint validation.

Add the optional `@swiftuijs/twill/vite-react` adapter for Vite 8 / React plugin 6 Fast Refresh, retaining hook state through Twill and native TS edits. Fix Vite client import analysis incorrectly treating optional configuration as browser dependencies. Watch inherited and newly created/deleted configuration files, invalidate affected environment graphs, and report invalid live configuration without crashing the server.

Node loader emission targets ES2022 so native TypeScript `using` / `await using` resource management works on supported Node 20 consumers as well as newer engines. Independent consumer checks exercise native async disposal together with Twill's `defer`.

Add a TypeScript 5.9 syntax/formatter corpus, 200 seeded differential runtime cases combining closures, guards and cleanup, and synchronized release/tag/artifact checks. This closes specific workflow gaps; the 0.x language remains experimental, with broader application validation, advanced editor refactoring and incremental declaration builds still outstanding.

## 0.7.0

Make every example a private pnpm workspace package with its own dependencies, Vite builds, checking, formatting and lint commands. The VS Code workspace exposes its own build/package/test entry points; the root coordinates shared validation.

Add independently installable Prettier and ESLint packages. Formatting preserves Twill syntax, comments, typed closure headers and component opt-out parentheses. The VSIX bundles document formatting. ESLint maps errors and safe fixes to original source and optionally runs type-aware rules against the virtual TypeScript program. Native TS-server overlay updates are queued immediately before later editor requests; diagnostics remain debounced.

Add `twill declarations` with standard declaration output, ordinary module specifiers, original-source maps and topological reference builds. A Vite library example and independent native TypeScript consumer verify distribution. Builds are declaration-only and nonincremental. Add mixed-project checking/editing and formatter measurements at 100/500/1000 modules. The language remains experimental; broad parser conformance, advanced refactoring and framework development transforms still need work.

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
