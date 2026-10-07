# Performance

## Runtime behavior

Twill is a build-time syntax layer. Ordinary trailing closures become native arrow functions and guards become native branches. Those constructs introduce no runtime library. The benchmark checks that representative callback output matches equivalent handwritten JavaScript, and React/Vue component output matches equivalent native JSX after emission.

Single-expression component children are direct JSX values. General child collection uses a local array and ordered pushes; parameterized render props remain lazy callbacks. These have the costs of their emitted JavaScript and the selected framework.

`defer` uses one callback and native `finally` for a single direct cleanup. Multiple or control-flow registrations use a lazy block-local stack with reverse-order draining. Both paths allocate cleanup closures; the dynamic path additionally allocates an array. Native `try/finally` remains useful for allocation-sensitive code. Explicit asynchronous cleanup adds the cost of awaiting cleanup.

## Compiler measurements

The following synthetic run was recorded on 2026-10-05, Linux x64, Node 24.19.0, an AMD EPYC 9V74 shared execution host. Each stage has five warmups and 15 timed samples. Syntax transformation preserves types; the plugin pipeline also erases types and lowers JSX. Both include high-resolution source maps with embedded source. Values are medians in milliseconds.

| Stage                      | 10 callbacks | 100 callbacks | 1,000 callbacks |
| -------------------------- | ------------ | ------------- | --------------- |
| Syntax → TypeScript        | 2.19 ms      | 15.00 ms      | 146.44 ms       |
| Syntax → implicit members  | 2.03 ms      | 15.50 ms      | 206.07 ms       |
| Syntax → JSX components    | 2.05 ms      | 10.89 ms      | 124.55 ms       |
| TypeScript plugin pipeline | 5.02 ms      | 22.05 ms      | 209.55 ms       |
| Component plugin pipeline  | 6.89 ms      | 30.51 ms      | 307.01 ms       |

Callback source sizes are 599 / 6,089 / 61,889 bytes. Implicit-member fixtures contain twice as many callbacks (20 / 200 / 2,000) and are 839 / 8,489 / 85,889 bytes. Component fixtures contain 10 / 100 / 1,000 nested views and are 679 / 6,889 / 69,889 bytes. These timings exclude process startup, filesystem discovery, project type checking, bundler optimization, rendering and editor UI. They are not whole-application build or runtime measurements. The [compiler report](https://github.com/swiftuijs/twill/blob/main/docs/benchmarks/compiler.json) includes p95 values, build identity and environment metadata.

## Cleanup cost

Each cleanup workload invokes a function 10,000 times per batch. The single-direct case registers one cleanup; the dynamic loop registers 1 / 10 / 100 cleanups per invocation. Cleanup adds to observable state. The reference performs the same additions in native `finally`, using a direct statement or reverse loop without registration closures or a stack. Each implementation has a separate batch call site, result assertions, 50 warmup batches and 15 timed samples.

| Workload                | Registrations per invocation | Generated defer, median batch | Native finally, median batch | Ratio |
| ----------------------- | ---------------------------- | ----------------------------- | ---------------------------- | ----- |
| Single direct statement | 1                            | 0.010 ms                      | 0.010 ms                     | 1.0×  |
| Dynamic loop            | 1                            | 0.245 ms                      | 0.014 ms                     | 18.0× |
| Dynamic loop            | 10                           | 1.055 ms                      | 0.085 ms                     | 12.5× |
| Dynamic loop            | 100                          | 19.745 ms                     | 0.828 ms                     | 23.8× |

The single-direct output matches a minimal handwritten callback/finally implementation after ordinary host minification. V8 can optimize this small, warmed-up example; its near-equal timing does not mean every cleanup closure is free. Dynamic registration exposes allocation and dispatch overhead in a tight synchronous loop. These measurements do not establish an application slowdown ratio, real I/O cleanup latency, or results on other engines.

## Guards and switch expressions

Destructured guards add a temporary and a nullish branch, followed by native destructuring. They add no wrapper object, callback or library. Direct-return switch expressions add a scoped native switch without a function. The unreleased standalone identifier-initializer path uses a result temporary and native labelled branches without a function. Other expression positions use one synchronous lexical arrow IIFE; `this`, `arguments` and scheduling retain native semantics. Selected object cases destructure the discriminator too, so a discriminator getter is read twice. Rest/default costs remain native destructuring costs.

The [branching report](https://github.com/swiftuijs/twill/blob/main/docs/benchmarks/branching.json) measures 1,000,000 calls per sample, 15 samples after warmup, with each native/dialect case in a separate process on Node 24.19 / AMD EPYC 9V74. Isolated processes avoid shared call-site feedback favoring whichever function runs first.

| Workload                      | Twill median | Native median | Minified function bytes Twill / native |
| ----------------------------- | ------------ | ------------- | -------------------------------------- |
| Destructured guard            | 2.49 ms      | 2.50 ms       | 75 / 75                                |
| Direct-return value switch    | 2.76 ms      | 2.89 ms       | 77 / 77                                |
| Switch in a local initializer | 2.75 ms      | 2.72 ms       | 95 / 90                                |

The initializer comparison uses a natural native switch assigning a local. The unreleased standalone identifier-initializer optimization removes the IIFE and preserves the original declaration, TDZ and mutability. Larger expressions, for headers, multiple declarators, destructuring, direct eval, JS JSDoc context and TS suppression pragmas retain the established expression path. Timing differences are not a general speedup claim or evidence that remaining closures never allocate. Other engines, cold execution, larger branches and captured values need application measurements. Await/yield inside a switch requires a direct return, avoiding hidden promise conversion or additional async scheduling.

The [application bundle report](https://github.com/swiftuijs/twill/blob/main/docs/benchmarks/bundle-size.json) covers five supported paths. Guards, callbacks and a single React child match the native minified byte size. The direct object-pattern switch is 205 bytes versus 203 bytes: its explicit lexical block adds two braces. Tests enforce those exact output budgets and runtime parity. There is no Twill runtime imported into these application fixtures. Dynamic cleanup, general child collection and arbitrary expression switches have separate costs and are outside this parity claim.

## Mixed projects and editing

The project benchmark uses isolated processes, one-third native TypeScript and two-thirds Twill, plus a module importing every file and a member-callback document. Cold checks include TypeScript standard libraries; warm checks, edited-hover requests and partial-member completions use 15 samples. Values below come from the [project report](https://github.com/swiftuijs/twill/blob/main/docs/benchmarks/project.json) on the same host.

| Source files | Cold check | Warm check p50 / p95 | Edited hover p50 / p95 | Member completion p50 / p95 | Peak process RSS |
| ------------ | ---------- | -------------------- | ---------------------- | --------------------------- | ---------------- |
| 102          | 501 ms     | 1.2 / 1.8 ms         | 17.9 / 30.1 ms         | 0.29 / 21.3 ms              | 412 MiB          |
| 502          | 726 ms     | 6.0 / 12.5 ms        | 39.4 / 69.7 ms         | 0.27 / 23.8 ms              | 485 MiB          |
| 1002         | 1020 ms    | 10.3 / 21.2 ms       | 71.0 / 100.6 ms        | 0.38 / 29.3 ms              | 598 MiB          |

The project stays alive while a 1,000-closure file is formatted. That cold, single-sample operation took 410–434 ms. Peak RSS therefore includes both the formatter and TypeScript; it is not incremental editor overhead. Measurements exclude VS Code rendering, the native TS-server bridge, dependency-heavy applications, HMR and application runtime.

Unchanged editor snapshots, transforms and mapping decoders are cached. The native TS-server bridge applies only changed overlays, retaining unrelated snapshots and script versions. The linter uses line indexes for source mapping rather than parsing additional ASTs. Edits invalidate affected files, while configuration changes rebuild affected projects. Typed ESLint includes program construction and freshness checks; syntactic lint offers lighter feedback. No editor responsiveness SLA follows from these synthetic results.

## Application output and distribution budgets

Equivalent native and dialect application fixtures are built with real esbuild bundling and minification. An implicit-member filter/map pipeline emits 76 bytes in both forms; a guarded numeric pipeline emits 88 bytes in both forms; a React single-child component emits 121 bytes in both forms. The checks compare byte counts and executed behavior, and reject compiler/runtime dependencies in the application graph. Identifier mangling can choose different short names. React's normal JSX runtime is external in this comparison. These small fixtures do not cover every application, dynamic cleanup or general child collection.

The VSIX ships one pinned TypeScript engine shared on disk by its two editor hosts, standard-library declarations, the checker and the lightweight formatter. The engine still runs in each host process; sharing its distribution does not imply shared process memory. The standalone formatter loads TS/ESTree support rather than Node's automatic parser discovery.

Distributed builds enforce these compressed artifact size limits:

| Artifact                   | Maximum compressed size |
| -------------------------- | ----------------------- |
| Compiler tarball           | 650 KiB                 |
| Formatter tarball          | 24 KiB                  |
| Linter tarball             | 24 KiB                  |
| Highlight tarball          | 24 KiB                  |
| Export tarball             | 28 KiB                  |
| VSIX, including its engine | 3 MiB                   |

Tarball budgets cover the package's own files, not installed npm dependencies. Development tools remain outside application bundles. These are distribution limits, not application bundle budgets or build-time guarantees.

## React framework source study

The [React source study](./react-source.md) compares the real React 19.3.0 client-core entry graph after identical Flow erasure. It adds an independently reproducible framework workload to the small synthetic fixtures above. The [report](https://github.com/swiftuijs/twill/blob/main/docs/benchmarks/react-framework.json) includes production bytes, gzip size, interleaved build samples and isolated core-runtime samples. ReactDOM/reconciler are not rewritten; this is not a full rendering-throughput or typed framework-port benchmark.

## Explicit enum patterns (unreleased prototype)

RFC 0016's explicit case descriptors are erased by native TS. Direct-return patterns and standalone identifier initializers use native switches and per-arm const destructuring without an IIFE. Other expression positions keep the existing synchronous IIFE. Native rest bindings allocate/copy normally. The checked TS application bundle fixture with defaults/rest is 182 bytes versus 180 bytes for handwritten JS: two outer scope braces, with no matching runtime, factory access/call or additional result record. CI enforces that 2-byte budget and verifies runtime behavior and dependency absence.

On 2026-10-07, Node v24.19.0, Linux x64, INTEL(R) XEON(R) PLATINUM 8573C, three separate warmed processes per variant ran 1,000,000 calls per sample, five warmups and 15 samples each. Launch order alternated, and the table aggregates all 45 measured samples. Both variants compiled the dialect once before sampling to balance compiler setup. Inputs cycle through idle and two loaded records; observable checksums agree. These are medians for one batch:

| Workload                 | Generated pattern | Native baseline | Ratio |
| ------------------------ | ----------------- | --------------- | ----- |
| direct-named-payload     | 6.22 ms           | 6.37 ms         | 0.98× |
| expression-named-payload | 8.03 ms           | 8.06 ms         | 1.00× |
| native-object-rest       | 34.67 ms          | 34.41 ms        | 1.01× |

The first prototype used an expression IIFE and measured 3.05× slower than native local assignment. That avoidable function is removed for standalone identifier initializers: the new measured path is comparable to native, rather than accepting the earlier slowdown. The checked application fixture adds 8 bytes and CI rejects an added arrow/IIFE. The direct and rest paths are also comparable in this run; none establishes a general speedup. Remaining expression-wrapper contexts need independent measurement/optimization. Rest costs reflect native allocation in both implementations; no application or cross-engine guarantee follows.

Synthetic typed files contain 10 / 100 / 1,000 functions sharing two variants. Transform timings include high-resolution maps; the native transform parses an unchanged TS file. Cold checks include creating a project and reading standard libraries; they are single observations, not sampled medians:

| Functions | Pattern → TS median | Unchanged TS transform median | Pattern cold check | Native cold check |
| --------- | ------------------- | ----------------------------- | ------------------ | ----------------- |
| 10        | 5.14 ms             | 3.70 ms                       | 629.86 ms          | 340.74 ms         |
| 100       | 23.50 ms            | 23.70 ms                      | 417.12 ms          | 264.11 ms         |
| 1000      | 298.48 ms           | 245.43 ms                     | 1427.92 ms         | 430.94 ms         |

Unchanged pattern diagnostics have cached medians of 0.02–0.07 ms. The descriptor rename guard indexes each file once and caches symbols by Program. Its first request on the 1,000-function fixture takes 217.91 ms, including mapping/symbol work; cached requests take 0.43 ms median. Edits invalidate the Program cache. These costs concern synthetic compiler/checker requests, not visible editor latency.

The [report](https://github.com/swiftuijs/twill/blob/main/docs/benchmarks/enum-patterns.json) records inputs, p95, checksums, environment, base commit/tree, dirty-working-tree status and build/script digests. The source was an unreleased implementation checkout. Reproduce with `pnpm build` then `pnpm benchmark:enum-patterns --output enum-patterns-results.json`. Runtime tests use unchecked JS lowering; erased TS descriptors and native imports are additionally covered by checked bundle and package tests. Timing ratios are observations; correctness, absence of runtime dependencies and bytes are deterministic CI gates.

## Evaluate your application

Measure build time, edited-file feedback and representative runtime paths before and after adopting a module. Use the same dependencies, hardware and production build settings. Inspect emitted code and bundle size, and exercise cleanup and error paths; warmed microbenchmarks can hide allocation costs that matter elsewhere.

The reports above include their inputs, sampling methods, environment and build identity. Instructions for reproducing repository benchmarks are in the [contributor development guide](https://github.com/swiftuijs/twill/blob/main/docs/contributing/tooling.md#benchmark-changes). Correctness and output budgets are enforced; wall-clock thresholds are not enforced across different runners.
