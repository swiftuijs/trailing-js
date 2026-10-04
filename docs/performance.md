# Performance contract and measurements

## Runtime

Ordinary trailing closures lower to native arrows. Guards lower to native branches and, for bindings, native `const` declarations. These two features add no callback dispatch wrapper, resource stack or scheduler. The compiler is not an application runtime dependency. Code-identity tests minify the generated code and equivalent handwritten JS using the same host transform and compare their output. This is evidence for the tested lowerings, not a claim that arbitrary programs become faster or that every JS engine has identical timing.

Single-expression React children lower directly to a JSX expression, without a collector or callback. Vue single-expression slots return their value lazily. Blocks requiring collection allocate an array and call `push` for each collected expression, collapsing one collected React child to its original value; compare them with equivalent handwritten collection code. React/Vue use their standard JSX element/slot runtime operations. There are no Twill component wrappers or extra component functions. Ordinary callbacks do not collect children. `defer` explicitly creates a lazy local registration array and one capturing arrow per reached registration. A mixed sync/async scope also stores a descriptor per registration. Cleanups drain through native finally; async cleanup awaits serially. Unreached registration allocates no array or callback. A block without defer emits no cleanup code. Native try/finally remains useful in allocation-sensitive code. If/switch expressions remain unimplemented.

### Defer workload

The 0.3 runtime fixture invokes a function 10,000 times per timed batch. Each function registers 1 / 10 / 100 synchronous cleanups in an unbraced loop; each cleanup adds its captured index to an observable state, in reverse order. The reference uses a handwritten finally loop doing the same additions without registration closures or an array. Both timings include the same result assertions, 50 warmup batches to settle JIT tiers, and 15 samples, on the host below.

| Registrations per invocation | Twill defer, batch median | Native finally loop, batch median | Ratio |
| ---------------------------- | ------------------------- | --------------------------------- | ----- |
| 1                            | 0.251 ms                  | 0.052 ms                          | 4.9×  |
| 10                           | 1.070 ms                  | 0.093 ms                          | 11.5× |
| 100                          | 18.762 ms                 | 0.847 ms                          | 22.1× |

This synthetic hot loop makes allocation and callback dispatch visible; the native loop can also benefit from JIT optimization. At 100 registrations, defer adds approximately 1.8 microseconds per invocation on this host. That is a measured cost, not a universal bound, an async/I/O measurement or a guarantee for different engines. Simple direct cleanup is faster in native finally; defer trades that work for reached-registration semantics, lexical captures and guaranteed execution of every cleanup. It imports no cleanup runtime. Use representative workloads before choosing it for hot loops.

## Compilation

The extra syntax requires parsing and mapping. For TS/JSX the build pipeline also runs the normal TypeScript emitter and composes maps. Both source extensions use the TS emitter; an explicit `language: "js"` compiler API call can perform JS-only syntax transformation. Historical JS-dialect plugin measurements below describe the old experimental formats, which are no longer registered. The compiler does not perform whole-program optimization and does not replace the host's target lowering, tree shaking or minification.

Measurements below were taken on Linux x64, Node 24.19.0, an AMD EPYC 9V74 shared host, on 2026-10-04. Each stage gets 5 warmups and 15 timed samples in one process. Values are medians in milliseconds. Both versions emit high-resolution maps with embedded source. Source sizes are 599 / 6,089 / 61,889 bytes, with 10 / 100 / 1,000 repeated array callbacks. The baseline is repository commit `0dd9f6e659df7926d51175f4c3c3a8aa4ed0b06d` (0.1.0); the historical optimized result is the 0.2 working build recorded with its SHA-256 build digest.

| Stage                                           | 10 callbacks, 0.1 → 0.2 | 100 callbacks, 0.1 → 0.2 | 1,000 callbacks, 0.1 → 0.2 |
| ----------------------------------------------- | ----------------------- | ------------------------ | -------------------------- |
| Sugar → TS, preserving types                    | 2.31 → 2.22             | 18.39 → 13.18            | 316.53 → 127.40            |
| Sugar → JS, syntax only                         | 1.15 → 0.77             | 8.66 → 5.66              | 244.96 → 60.14             |
| JS build-plugin pipeline                        | 2.89 → 0.99             | 16.30 → 5.64             | 306.91 → 56.80             |
| TS build-plugin pipeline                        | 3.97 → 5.27             | 24.67 → 18.87            | 417.40 → 202.94            |
| Already-standard TS through the syntax compiler | 1.72 → 1.42             | 11.17 → 8.94             | 137.98 → 92.38             |

For the largest fixture, TS syntax transformation is about 2.5× faster and the JS plugin pipeline about 5.4× faster than 0.1. Small-file TS pipeline timing varies and was slower in this particular run; the changes do not improve every workload. TypeScript's emitter alone on the equivalent plain JS fixture took 66.95 ms at 1,000 callbacks in the current run. It is a useful reference for ordinary emission cost, not an equivalent full dialect pipeline or a type-checking measurement.

Parser subclass reuse, one line index for parameter locations and removal of unnecessary AST traversals account for much of the syntax improvement. Historical JS-dialect builds skipped the TS emitter. Reusing a decoded trace map changes repeated mapping queries from repeated full decoding to indexed lookups. The archived reports include this warm mapping stage and p95 timings; it excludes first decoding by design.

These numbers exclude process startup, dependency loading, whole-project type checking, filesystem work, bundler optimization, framework rendering, and editor UI latency. They are synthetic callback-density measurements, not a production-project SLA. Shared-host scheduling and garbage collection affect results; evaluate representative application code on the intended hardware. The 61.9 KB fixture still adds roughly 203 ms in the TS plugin pipeline, so build overhead should not be described as zero.

### Twill 0.3

The fresh 0.3 run uses the same callback fixtures and host. The new contextual cleanup support does not emit cleanup code when unused.

| Stage                    | 10 callbacks | 100 callbacks | 1,000 callbacks |
| ------------------------ | ------------ | ------------- | --------------- |
| Sugar → TS               | 2.04 ms      | 11.89 ms      | 115.53 ms       |
| Sugar → JS, syntax only  | 0.75 ms      | 4.49 ms       | 52.68 ms        |
| JS build-plugin pipeline | 0.87 ms      | 5.11 ms       | 53.32 ms        |
| TS build-plugin pipeline | 4.44 ms      | 22.97 ms      | 184.97 ms       |

These remain build costs, with the same exclusions and host variability described above. The report includes runtime cleanup medians and p95 alongside build-stage timings. Historical versions are retained for comparison; they are not supported compatibility entry points.

### Twill 0.5

The current source formats are `.twill` and `.twillx`. The JS syntax API measurement explicitly selects `language: "js"`; there is no JS-ending dialect extension or separate JS-file plugin pipeline. The UI fixture contains the same number of views as the callback fixture contains callbacks: each view has nested `Card`/`Label` closures and an `if` child. UI source sizes are 679 / 6,889 / 69,889 bytes. Each stage uses the same five warmups and fifteen samples on the host above.

| Stage              | 10 fixtures | 100 fixtures | 1,000 fixtures |
| ------------------ | ----------- | ------------ | -------------- |
| Sugar → TS         | 2.49 ms     | 14.09 ms     | 126.36 ms      |
| JS syntax API      | 0.79 ms     | 6.07 ms      | 60.93 ms       |
| TS plugin pipeline | 4.11 ms     | 19.23 ms     | 210.60 ms      |
| UI syntax → JSX    | 1.36 ms     | 8.73 ms      | 120.59 ms      |
| UI plugin pipeline | 4.30 ms     | 25.25 ms     | 294.94 ms      |

These are measured build costs, not runtime timings or hardware-independent guarantees. UI single-expression children compile directly to JSX values; blocks with declarations retain their value type, and general collectors collapse a single React child so single-element component APIs continue working. Vue content stays lazy. Runtime comparisons verify ordinary callbacks against handwritten JS and both frameworks against equivalent handwritten JSX child collection after the same emission and whitespace/syntax minification; identifier spelling is held constant for this comparison. No Twill wrapping component or dispatch helper appears in UI bundles.

The [0.5 report](benchmarks/current-0.5.json) records the working build digest and parent commit, together with the source version and timings. CI provides a fresh report for the committed build. The cleanup workload still has explicit allocation/dispatch costs, approximately 4.8× / 11.5× / 21.9× the allocation-free finally loop for 1 / 10 / 100 registrations on this run. This does not establish real application latency or a universal bound.

### Twill 0.6

The pnpm/Vite build repeats the same fixtures and methodology. The [0.6 report](benchmarks/current-0.6.json) records the working build digest, environment, medians and p95 values.

| Stage              | 10 fixtures | 100 fixtures | 1,000 fixtures |
| ------------------ | ----------- | ------------ | -------------- |
| Sugar → TS         | 2.29 ms     | 15.61 ms     | 139.58 ms      |
| TS plugin pipeline | 4.92 ms     | 20.51 ms     | 206.56 ms      |
| UI syntax → JSX    | 1.86 ms     | 10.83 ms     | 118.43 ms      |
| UI plugin pipeline | 6.83 ms     | 29.97 ms     | 323.65 ms      |

This run does not establish a build speedup from the monorepo migration. Shared-host timing varies; the UI metadata needed for source editing also forms part of the compiler's work. Native-output assertions still pass for ordinary callbacks and framework children. The cleanup microbenchmark remains approximately 4.7× / 11.7× / 21.6× the compared allocation-free finally loop; it is not an application slowdown measurement.

## Editor and regression verification

Repeated submissions of unchanged editor text retain the transform and the TS semantic program. Changes advance only the changed script's version; TypeScript follows dependencies. Disk refresh now invalidates individual files while retaining unrelated transforms and unsaved overlays; create/delete refreshes root discovery. Configuration changes rebuild affected projects. Explicit full invalidation remains available. Mapping decoders and line indexes are weakly cached with their source result, and completion documentation is requested only when an item is selected. Tests check snapshot reuse, changed-file invalidation, disk refresh, mappings across line separators and type narrowing. Real extension-host tests confirm dependency disk changes refresh mapped diagnostics without losing unsaved buffers. No editor responsiveness SLA is inferred from a compiler benchmark.

Reproduce the current measurement from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm benchmark --output benchmark-results.json
```

The report records Node/OS/CPU, package version, commit, working-tree state, built-JS digest, source sizes, samples and all timings. See [0.3 JSON](benchmarks/current-0.3.json), [historical baseline JSON](benchmarks/baseline-0.1.json) and [0.2 JSON](benchmarks/current-0.2.json). To rerun a historical version, use its recorded checkout/build and its original benchmark script, which uses the names and extensions of that version.

Linux/Node 22 CI uploads a fresh benchmark alongside package/coverage artifacts for comparison. CI enforces semantic/code-identity correctness rather than fragile wall-clock thresholds across different runners. Benchmarking has no added runtime dependency for consumers.

## Mixed-project checking and editing (0.7)

Run `pnpm benchmark:project --output project-results.json`. The [recorded synthetic run](benchmarks/project-0.7.json) uses isolated processes, one-third native TS and two-thirds Twill, plus a source importing every module. Cold checks include TypeScript standard libraries. Warm checks and hover/edit requests use 15 samples. The project program stays alive while a 1,000-closure file is formatted, so peak RSS includes the formatter and TypeScript; it is not the editor bridge's incremental memory overhead.

| Source files | Cold check | Warm check p50 / p95 | Edited hover p50 / p95 | Peak process RSS |
| ------------ | ---------- | -------------------- | ---------------------- | ---------------- |
| 101          | 434 ms     | 1.2 / 1.9 ms         | 16.5 / 34.9 ms         | 406 MiB          |
| 501          | 840 ms     | 5.7 / 10.4 ms        | 41.0 / 62.7 ms         | 479 MiB          |
| 1001         | 934 ms     | 9.3 / 22.4 ms        | 66.8 / 91.9 ms         | 599 MiB          |

A cold format of 1,000 closures took 389–434 ms in these processes. These measurements exclude VS Code rendering, the additional native TS-server bridge, bundler/HMR, dependency-heavy real applications and application runtime. They show useful cached checking, while memory and changed-file latency still deserve profiling for larger workspaces. Typed ESLint adds program construction and file freshness checks; prefer syntactic lint for fast default feedback and typed lint for CI when appropriate.
