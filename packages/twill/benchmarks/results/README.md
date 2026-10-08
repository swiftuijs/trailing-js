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

`script-cache-linux-node24.json` records the final 21 pairs at source commit `b15fd34`, including every source/build identity. Medians were:

| Fresh interpreter workload | Wall time | Interpreter CPU |  Peak RSS |
| -------------------------- | --------: | --------------: | --------: |
| Native equivalent JS       |   43.8 ms |         36.5 ms |  25.5 MiB |
| Uncached Twill source      |  519.9 ms |        568.2 ms | 115.3 MiB |
| Empty-cache Twill source   |  541.3 ms |        594.9 ms | 127.2 MiB |
| Cached Twill source        |  152.7 ms |        155.6 ms |  64.2 MiB |

The paired hit/uncached median ratio was 0.2923 (deterministic bootstrap 95% interval 0.2887–0.3028), a roughly 71% startup reduction for this workload. The paired miss/uncached median was 1.0331, about 3% overhead. The completed entry occupied 1,607 bytes. Native startup remains faster; no native parity claim.

`startup-profile-original-linux-node24.json` identifies the separately built eager loader from PR #20 (`caf2c7e`) by its path and SHA-256; `startup-profile-cache-linux-node24.json` identifies the lazy/cache loader. Each preserves five phase observations per mode. The original loader's compiler initialization happens during loader import. The new loader imports only lightweight hooks; compiler initialization moves to misses, while hits load only the cached entry without compiler modules. The ordinary binary measurements above include the additional interpreter and asynchronous-hook worker startup that the phase wrapper excludes.

Reproduce the ordinary binary and instrumented phase observations after building:

```sh
node packages/twill/benchmarks/script-startup.mjs > script-startup-results.json
node packages/twill/benchmarks/startup-profile.mjs > startup-profile-results.json
# Point at a separately built original checkout to compare eager initialization.
TWILL_PROFILE_LOADER=/absolute/original/packages/twill/dist/loader.js \
  node packages/twill/benchmarks/startup-profile.mjs > original-profile-results.json
```

Each interpreter is fresh; filesystem/OS caches are warm. The hit uses an already populated disk cache, while the miss removes it before starting the timer. All paired samples remain in the report. CPU includes the entire interpreter and loader worker; it is not the subprocess SDK's parent-only CPU metric. Peak RSS is the OS observation, not a hard bound. The phase wrapper adds overhead and excludes interpreter/worker creation; ordinary binary measurements determine startup results. Native exported JavaScript retains the smallest first-launch path. No Rust implementation or performance result is included.
