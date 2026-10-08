# Executable-script startup measurements

`runner-linux-node24.json` records 15 alternating paired launches of fresh Node processes executing identical Twill source, comparing the published-style Node loader invocation with the new direct `twill` binary. No subprocess SDK or external command is part of this workload. Every sample is retained; the report identifies the source commit, entry source hash, runtime/build entry hashes, exact commands and environment.

On this Linux/Node 24 machine, cold medians were 520.8 ms for the loader and 475.0 ms for the runner. The median paired runner/loader ratio was 0.915, with a deterministic paired-bootstrap 95% interval of 0.734–0.953. These observations show no added startup regression in this sample, not a portable speedup or parity with native Node. Both paths include source compilation. Original source/build identities are available at commit `e25166574e22b8a1c2a415876185712e590847a9`.

Reproduce after building the compiler, on an otherwise idle machine:

```sh
pnpm --filter @swiftuijs/twill build
node packages/twill/benchmarks/runner.mjs > runner-results.json
```

The runner dispatches before importing compile/check/export tooling and executes the script in the same Node process. Functional tests verify that its PID matches the launched interpreter, rather than relying on timing to prove there is no intermediary child. Warm subprocess execution and capture-memory comparisons belong to the separate shell SDK benchmark; these startup samples do not alter those results.

## Compilation-cache prototype

`script-cache-first-review-linux-node24.json` retains the first 21 alternating paired observations from source commit `de30197`. Uncached/empty-cache/hit/native medians were 516.9/551.5/152.1/41.2 ms. The paired hit/uncached median was 0.2935 (95% interval 0.2794–0.2996); the paired miss/uncached median was 1.0588. The subsequent review gives file boundaries explicit framing in compiler fingerprints and hashes source directly before constructing the compact cache key. These are cache-correctness refinements, not discarded timing samples.

Reproduce the ordinary binary and instrumented phase observations after building:

```sh
node packages/twill/benchmarks/script-startup.mjs > script-startup-results.json
node packages/twill/benchmarks/startup-profile.mjs > startup-profile-results.json
# Point at a separately built original checkout to compare eager initialization.
TWILL_PROFILE_LOADER=/absolute/original/packages/twill/dist/loader.js \
  node packages/twill/benchmarks/startup-profile.mjs > original-profile-results.json
```

Each interpreter is fresh; filesystem/OS caches are warm. The hit uses an already populated disk cache, while the miss removes it before starting the timer. All paired samples remain in the report. CPU includes the entire interpreter and loader worker; it is not the subprocess SDK's parent-only CPU metric. Peak RSS is the OS observation, not a hard bound. The phase wrapper adds overhead and excludes interpreter/worker creation; ordinary binary measurements determine startup results. Native exported JavaScript retains the smallest first-launch path. No Rust implementation or performance result is included.
