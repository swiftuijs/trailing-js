# Complete-contract Rust backend measurements

These reports measure the explicit `@swiftuijs/twill-shell-native` backend, not the earlier libuv-pool experiment. They retain all raw samples, environment and workload details, implementation commits, source/build hashes and observed artifact bytes. Parent CPU includes the Rust reactor and excludes child CPU. Captured-byte comparisons happen outside timed operations.

The harness alternates all six native Node / SDK / Rust orders across eleven paired samples. Its performance check requires both median paired wall ratios and the upper 95% paired bootstrap bound to stay within 1.10 of equivalent handwritten Node for every warm workload and default-pool concurrency workload. Cold launch, sampled memory, cancellation and unrelated filesystem work are separate observations, not claims of universal improvement.

- [First review run](production-first-review-linux-node24.json), implementation `c0bf98ace682817e3ff2f0a3af31650d03b69900`: all measured warm/default-pool performance checks passed. Subsequent review found unsafe foreign-thread Node cleanup, so this is historical performance evidence, not readiness evidence.
- [Exit-race checkpoint](production-exit-race-linux-node24.partial.json) and [failure log](production-exit-race-linux-node24.log), implementation `53225edbd9fa54a6c8fd82f296f36ca0e7476b21`: sequential, memory, concurrency, filesystem and cancellation observations completed, but a fresh Twill/native invocation crashed with SIGSEGV during the cold stage. The partial run does not pass acceptance. It motivated moving cleanup-hook removal back to the owning Node thread and adding repeated fresh-process/worker/Twill disposal tests.

Reproduce from a clean checkout after building the packages:

```sh
pnpm --filter @swiftuijs/twill-shell-native... build
node packages/shell-native/benchmarks/benchmark.mjs --output packages/shell-native/benchmarks/target/production.json --verify-performance
```

Run performance measurements without concurrent builds or test suites. Checkpoints go to the ignored `target` directory so a failed run retains completed samples. Preserve failed reports alongside successful reports; do not drop outliers or equate a timing result with cross-platform contract verification or npm publication.
