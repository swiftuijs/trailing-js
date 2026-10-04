# Performance contract and measurements

## Runtime

Ordinary trailing closures lower to native arrows. Guards lower to native branches and, for bindings, native `const` declarations. There is no callback dispatch wrapper, resource stack, scheduler or compiler dependency in the emitted application. Code-identity tests minify the generated code and equivalent handwritten JS using the same host transform and compare their output. This is evidence for the tested lowerings, not a claim that arbitrary programs become faster or that every JS engine has identical timing.

Explicit result builders allocate an array and call `push` for each collected expression; compare them with equivalent handwritten collection code. React/Vue adapters add their normal element/slot operations and callback execution. Avoid builders in a hot numerical loop unless collection is actually required. `defer` and expression if/switch are not implemented, so no hidden cleanup closures or IIFEs are added.

## Compilation

The extra syntax requires parsing and mapping. For TS/JSX the build pipeline also runs the normal TypeScript emitter and composes maps. Plain `.tjs` skips that emitter. The compiler does not perform whole-program optimization and does not replace the host's target lowering, tree shaking or minification.

Measurements below were taken on Linux x64, Node 24.19.0, an AMD EPYC 9V74 shared host, on 2026-10-04. Each stage gets 5 warmups and 15 timed samples in one process. Values are medians in milliseconds. Both versions emit high-resolution maps with embedded source. Source sizes are 599 / 6,089 / 61,889 bytes, with 10 / 100 / 1,000 repeated array callbacks. The baseline is repository commit `0dd9f6e659df7926d51175f4c3c3a8aa4ed0b06d` (0.1.0); the current result is the 0.2 working build recorded with its SHA-256 build digest.

| Stage                                           | 10 callbacks, 0.1 → 0.2 | 100 callbacks, 0.1 → 0.2 | 1,000 callbacks, 0.1 → 0.2 |
| ----------------------------------------------- | ----------------------- | ------------------------ | -------------------------- |
| Sugar → TS, preserving types                    | 2.31 → 2.22             | 18.39 → 13.18            | 316.53 → 127.40            |
| Sugar → JS, syntax only                         | 1.15 → 0.77             | 8.66 → 5.66              | 244.96 → 60.14             |
| JS build-plugin pipeline                        | 2.89 → 0.99             | 16.30 → 5.64             | 306.91 → 56.80             |
| TS build-plugin pipeline                        | 3.97 → 5.27             | 24.67 → 18.87            | 417.40 → 202.94            |
| Already-standard TS through the syntax compiler | 1.72 → 1.42             | 11.17 → 8.94             | 137.98 → 92.38             |

For the largest fixture, TS syntax transformation is about 2.5× faster and the JS plugin pipeline about 5.4× faster than 0.1. Small-file TS pipeline timing varies and was slower in this particular run; the changes do not improve every workload. TypeScript's emitter alone on the equivalent plain JS fixture took 66.95 ms at 1,000 callbacks in the current run. It is a useful reference for ordinary emission cost, not an equivalent full dialect pipeline or a type-checking measurement.

Parser subclass reuse, one line index for parameter locations and removal of unnecessary AST traversals account for much of the syntax improvement. Skipping the TS emitter benefits JS. Reusing a decoded trace map changes repeated mapping queries from repeated full decoding to indexed lookups. The archived reports include this warm mapping stage and p95 timings; it excludes first decoding by design.

These numbers exclude process startup, dependency loading, whole-project type checking, filesystem work, bundler optimization, framework rendering, and editor UI latency. They are synthetic callback-density measurements, not a production-project SLA. Shared-host scheduling and garbage collection affect results; evaluate representative application code on the intended hardware. The 61.9 KB fixture still adds roughly 203 ms in the TS plugin pipeline, so build overhead should not be described as zero.

## Editor and regression verification

Repeated submissions of unchanged editor text retain the transform and the TS semantic program. Changes advance only the changed script's version; TypeScript follows dependencies. Explicit invalidation still refreshes all scripts. Mapping decoders and line indexes are weakly cached with their source result, and completion documentation is requested only when an item is selected. Tests check snapshot reuse, changed-file invalidation, disk refresh, mappings across line separators and type narrowing. No editor responsiveness SLA is inferred from a compiler benchmark.

Reproduce the current measurement from the repository root:

```sh
npm ci
npm run build
npm run benchmark -- --output benchmark-results.json
```

The report records Node/OS/CPU, package version, commit, working-tree state, built-JS digest, source sizes, samples and all timings. See [baseline JSON](benchmarks/baseline-0.1.json) and [0.2 JSON](benchmarks/current-0.2.json). To rerun the baseline, use the benchmark script with a checkout/build of the recorded 0.1 commit; its stages use APIs available in both versions.

Linux/Node 22 CI uploads a fresh benchmark alongside package/coverage artifacts for comparison. CI enforces semantic/code-identity correctness rather than fragile wall-clock thresholds across different runners. Benchmarking has no added runtime dependency for consumers.
