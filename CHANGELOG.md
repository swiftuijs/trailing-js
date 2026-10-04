# Changelog

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
