# Performance

## Runtime behavior

Twill is a build-time syntax layer. Ordinary trailing closures become native arrow functions and guards become native branches. Those constructs introduce no runtime library. The benchmark checks that representative callback output matches equivalent handwritten JavaScript, and React/Vue component output matches equivalent native JSX after emission.

Single-expression component children are direct JSX values. General child collection uses a local array and ordered pushes; parameterized render props remain lazy callbacks. These have the costs of their emitted JavaScript and the selected framework.

`defer` registers cleanup closures in a lazily allocated, block-local stack and drains them in reverse order through `finally`. It adds allocation and callback dispatch. Native `try/finally` remains useful for allocation-sensitive code. Explicit asynchronous cleanup adds the cost of awaiting cleanup.

## Compiler measurements

The following synthetic run was recorded on 2026-10-05, Linux x64, Node 24.19.0, an AMD EPYC 9V74 shared host. Each stage has five warmups and 15 timed samples. Syntax transformation preserves types; the plugin pipeline also erases types and lowers JSX. Both include high-resolution source maps with embedded source. Values are medians in milliseconds.

| Stage                      | 10 callbacks | 100 callbacks | 1,000 callbacks |
| -------------------------- | ------------ | ------------- | --------------- |
| Syntax → TypeScript        | 1.96 ms      | 13.13 ms      | 129.23 ms       |
| Syntax → JSX components    | 1.34 ms      | 10.40 ms      | 122.21 ms       |
| TypeScript plugin pipeline | 4.06 ms      | 19.51 ms      | 215.04 ms       |
| Component plugin pipeline  | 4.47 ms      | 26.96 ms      | 297.01 ms       |

Callback source sizes are 599 / 6,089 / 61,889 bytes. Component fixtures contain 10 / 100 / 1,000 nested views and are 679 / 6,889 / 69,889 bytes. These timings exclude process startup, filesystem discovery, project type checking, bundler optimization, rendering and editor UI. They are not whole-application build or runtime measurements. The [compiler report](https://github.com/swiftuijs/twill/blob/main/docs/benchmarks/compiler.json) includes p95 values, build identity and environment metadata.

## Cleanup cost

Each batch invokes a function 10,000 times, registering 1 / 10 / 100 synchronous cleanups per invocation. Cleanup adds captured indexes to observable state. The reference performs the same additions in a handwritten `finally` loop without registration closures or a stack. Both include result assertions, 50 warmup batches and 15 timed samples.

| Registrations per invocation | Generated defer, median batch | Native finally, median batch | Ratio |
| ---------------------------- | ----------------------------- | ---------------------------- | ----- |
| 1                            | 0.247 ms                      | 0.052 ms                     | 4.8×  |
| 10                           | 1.085 ms                      | 0.093 ms                     | 11.6× |
| 100                          | 20.219 ms                     | 0.852 ms                     | 23.7× |

This comparison exposes allocation and dispatch overhead in a tight synchronous loop. It does not establish an application slowdown ratio, real I/O cleanup latency, or results on other engines.

## Mixed projects and editing

The project benchmark uses isolated processes, one-third native TypeScript and two-thirds Twill, plus a module importing every file. Cold checks include TypeScript standard libraries; warm checks and edited-hover requests use 15 samples. Values below come from the [project report](https://github.com/swiftuijs/twill/blob/main/docs/benchmarks/project.json) on the same host.

| Source files | Cold check | Warm check p50 / p95 | Edited hover p50 / p95 | Peak process RSS |
| ------------ | ---------- | -------------------- | ---------------------- | ---------------- |
| 101          | 571 ms     | 1.8 / 4.7 ms         | 16.2 / 61.6 ms         | 396 MiB          |
| 501          | 756 ms     | 5.7 / 9.8 ms         | 40.3 / 63.2 ms         | 490 MiB          |
| 1001         | 1014 ms    | 11.9 / 15.5 ms       | 66.6 / 100.9 ms        | 596 MiB          |

The project stays alive while a 1,000-closure file is formatted. That cold, single-sample operation took 388–461 ms. Peak RSS therefore includes both the formatter and TypeScript; it is not incremental editor overhead. Measurements exclude VS Code rendering, the native TS-server bridge, dependency-heavy applications, HMR and application runtime.

Unchanged editor snapshots, transforms and mapping decoders are cached. Edits invalidate affected files, while configuration changes rebuild affected projects. Typed ESLint includes program construction and freshness checks; syntactic lint offers lighter feedback. No editor responsiveness SLA follows from these synthetic results.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm build:core
pnpm --filter @swiftuijs/twill-formatter build
pnpm benchmark --output compiler-results.json
pnpm benchmark:project --output project-results.json
```

Compiler reports include package version, commit, dirty-tree state and the built-JavaScript digest. CI uploads a fresh benchmark artifact. Correctness and output equivalence are enforced; wall-clock thresholds are not enforced across different runners. Profile your application's representative workloads before drawing conclusions about performance.
