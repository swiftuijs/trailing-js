# React framework source comparison

This private workspace rewrites the **React framework client core**, not an application. It pins React 19.3.0 at `1d34f91dfde6bba84d08b683aaba164c7194dacb`, vendors its MIT-licensed entry graph, and keeps the reviewable `.twill` source graph under `src/packages`. Development and production use React's respective entry points and reachable shared modules. The development contract build is CommonJS, preserving React's Node `module.require`/`setImmediate` path for `act`; the production/browser build is ESM.

```sh
pnpm --filter @swiftuijs/twill-example-react-framework build
pnpm --filter @swiftuijs/twill-example-react-framework test:example
pnpm --filter @swiftuijs/twill-example-react-framework test:browser
pnpm benchmark:react-framework --output ../../react-framework-results.json
```

Native and Twill variants share the same Flow type erasure, feature flags, Vite production target and minifier. The Twill variant uses the actual public Vite plugin. Conservative rewrites replace early-exit branches with guards and final expression-arrow arguments with trailing callbacks. Named/dynamic-this function callbacks remain native; no cleanup allocations are introduced into React hot paths.

`build` validates the pinned source hashes, regenerates both variants and builds dev/prod output. Contracts cover APIs, elements/keys, children/iterables, error cases, hook dispatch, transitions, lazy resolution/rejection/suspension and development `act`. Browser tests build a small renderer harness using the existing ReactDOM package with each rewritten core, checking state, effects/cleanup, reducer, memo/ref/context, transitions and Suspense. This harness tests framework compatibility; it is not the source being rewritten.

Production and development output sizes have deterministic budgets against their native counterpart. Benchmarks alternate build order and run runtime variants in separate processes. Build measurements exclude Flow erasure, source preparation and process startup; runtime samples exercise core APIs, not reconciler/rendering throughput. The report records inputs and environment. Wall-clock ratios are measurements rather than CI pass/fail thresholds.

## Reproduce from upstream

Clone the pinned commit, then run:

```sh
node examples/react-framework/scripts/prepare.mjs --upstream /absolute/path/to/react
```

The script rejects a different HEAD and preserves React's copyright headers and license. CI needs no network checkout: the source snapshot is checked in. Source hashes in `sources.json` prevent accidental changes; normal preparation rejects a modified snapshot. Generated native sources and builds live in ignored `dist`.

## Scope

This is a source compatibility and runtime pilot, not a maintained React fork. ReactDOM, reconciler, Scheduler, server components, native renderers, compiler and DevTools are **not rewritten**. It does not run React's entire upstream test suite or reproduce the official Rollup release pipeline. Flow annotations are erased, not translated to TypeScript; this does not establish type-checking or editor usability for a typed framework port. These remain separate adoption gates.
