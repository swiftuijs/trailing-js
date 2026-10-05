# Performance

## Runtime behavior

Twill is a build-time syntax layer. Ordinary trailing closures become native arrow functions and guards become native branches. Those constructs introduce no runtime library. The benchmark checks that representative callback output matches equivalent handwritten JavaScript, and React/Vue component output matches equivalent native JSX after emission.

Single-expression component children are direct JSX values. General child collection uses a local array and ordered pushes; parameterized render props remain lazy callbacks. These have the costs of their emitted JavaScript and the selected framework.

`defer` uses one callback and native `finally` for a single direct cleanup. Multiple or control-flow registrations use a lazy block-local stack with reverse-order draining. Both paths allocate cleanup closures; the dynamic path additionally allocates an array. Native `try/finally` remains useful for allocation-sensitive code. Explicit asynchronous cleanup adds the cost of awaiting cleanup.

## Compiler measurements

The following synthetic run was recorded on 2026-10-05, Linux x64, Node 22.23.3, an AMD EPYC 7763 shared GitHub Actions runner. Each stage has five warmups and 15 timed samples. Syntax transformation preserves types; the plugin pipeline also erases types and lowers JSX. Both include high-resolution source maps with embedded source. Values are medians in milliseconds.

| Stage                      | 10 callbacks | 100 callbacks | 1,000 callbacks |
| -------------------------- | ------------ | ------------- | --------------- |
| Syntax → TypeScript        | 3.74 ms      | 19.73 ms      | 177.94 ms       |
| Syntax → JSX components    | 3.19 ms      | 13.83 ms      | 145.12 ms       |
| TypeScript plugin pipeline | 9.44 ms      | 29.95 ms      | 269.76 ms       |
| Component plugin pipeline  | 8.98 ms      | 37.55 ms      | 365.59 ms       |

Callback source sizes are 599 / 6,089 / 61,889 bytes. Component fixtures contain 10 / 100 / 1,000 nested views and are 679 / 6,889 / 69,889 bytes. These timings exclude process startup, filesystem discovery, project type checking, bundler optimization, rendering and editor UI. They are not whole-application build or runtime measurements. The [compiler report](https://github.com/swiftuijs/twill/blob/main/docs/benchmarks/compiler.json) includes p95 values, build identity and environment metadata.

## Cleanup cost

Each cleanup workload invokes a function 10,000 times per batch. The single-direct case registers one cleanup; the dynamic loop registers 1 / 10 / 100 cleanups per invocation. Cleanup adds to observable state. The reference performs the same additions in native `finally`, using a direct statement or reverse loop without registration closures or a stack. Each implementation has a separate batch call site, result assertions, 50 warmup batches and 15 timed samples.

| Workload                | Registrations per invocation | Generated defer, median batch | Native finally, median batch | Ratio |
| ----------------------- | ---------------------------- | ----------------------------- | ---------------------------- | ----- |
| Single direct statement | 1                            | 0.019 ms                      | 0.019 ms                     | 1.0×  |
| Dynamic loop            | 1                            | 0.294 ms                      | 0.019 ms                     | 15.7× |
| Dynamic loop            | 10                           | 1.467 ms                      | 0.285 ms                     | 5.2×  |
| Dynamic loop            | 100                          | 16.082 ms                     | 1.260 ms                     | 12.8× |

The single-direct output matches a minimal handwritten callback/finally implementation after ordinary host minification. V8 can optimize this small, warmed-up example; its near-equal timing does not mean every cleanup closure is free. Dynamic registration exposes allocation and dispatch overhead in a tight synchronous loop. These measurements do not establish an application slowdown ratio, real I/O cleanup latency, or results on other engines.

## Mixed projects and editing

The project benchmark uses isolated processes, one-third native TypeScript and two-thirds Twill, plus a module importing every file. Cold checks include TypeScript standard libraries; warm checks and edited-hover requests use 15 samples. Values below come from the [project report](https://github.com/swiftuijs/twill/blob/main/docs/benchmarks/project.json) on the same host.

| Source files | Cold check | Warm check p50 / p95 | Edited hover p50 / p95 | Peak process RSS |
| ------------ | ---------- | -------------------- | ---------------------- | ---------------- |
| 101          | 738 ms     | 2.5 / 7.5 ms         | 26.1 / 41.3 ms         | 277 MiB          |
| 501          | 1186 ms    | 8.1 / 15.6 ms        | 56.7 / 103.9 ms        | 315 MiB          |
| 1001         | 1615 ms    | 15.7 / 26.1 ms       | 90.6 / 181.4 ms        | 433 MiB          |

The project stays alive while a 1,000-closure file is formatted. That cold, single-sample operation took 708–774 ms. Peak RSS therefore includes both the formatter and TypeScript; it is not incremental editor overhead. Measurements exclude VS Code rendering, the native TS-server bridge, dependency-heavy applications, HMR and application runtime.

Unchanged editor snapshots, transforms and mapping decoders are cached. The native TS-server bridge applies only changed overlays, retaining unrelated snapshots and script versions. The linter uses line indexes for source mapping rather than parsing additional ASTs. Edits invalidate affected files, while configuration changes rebuild affected projects. Typed ESLint includes program construction and freshness checks; syntactic lint offers lighter feedback. No editor responsiveness SLA follows from these synthetic results.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm --filter @swiftuijs/twill build
pnpm --filter @swiftuijs/twill-formatter build
pnpm benchmark --output compiler-results.json
pnpm benchmark:project --output project-results.json
```

Compiler reports include package version, commit, dirty-tree state and the built-JavaScript digest. Cleanup results identify single-direct and dynamic-loop workloads; the single-direct output is also checked against a minimal handwritten callback/finally implementation. CI uploads a fresh benchmark artifact. Correctness and output equivalence are enforced; wall-clock thresholds are not enforced across different runners. Profile your application's representative workloads before drawing conclusions about performance.
