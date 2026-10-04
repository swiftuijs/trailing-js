# Changelog

## 0.2.0

Trailing is now documented as a general-purpose JS/TS syntax-sugar language. Adds `guard … else` and nullish `guard const` bindings, conservative exit validation, TS narrowing, mapped diagnostics, and highlighting. A non-UI example covers validation, array pipelines, async retry and data builders.

Compiler improvements reuse parser classes, index parameter locations, avoid unnecessary AST walks, reuse source-map decoders and bypass TS transpilation for plain JS. Editor improvements retain unchanged overlays and per-file semantic snapshots, cache line indexes and resolve completion details lazily. Reproducible build benchmarks, runtime code-identity tests and CI benchmark artifacts document performance without imposing hardware-dependent timing limits.

The language design records which Swift features are implemented and which need further scope/runtime design. `defer`, expression if/switch and shorthand parameters are not implemented.

## 0.1.0

Initial experimental implementation: JS/TS trailing closures, typed and async headers, single-expression returns, positional multiple closures, explicit child builders, source maps, five build adapters, opt-in Node loading, virtual TypeScript project checking, framework-independent React/Vue helpers, runnable examples, and a VS Code extension with highlighting and semantic assistance.
