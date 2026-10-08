# Native subprocess measurements

These Linux x64 / Node 24.19.0 samples describe this environment, not universal performance. JSON reports retain the workload, argv, input size, source/build SHA-256 identities, source commit, every paired timing/parent CPU sample, isolated memory observations and separate cold starts. Runtime SDK source/build hashes in both reports match this implementation; later platform-fixture corrections do not change the runtime SDK. Reproduce the recorded fixture exactly from each report's `gitHead`.

`linux-node24-batched.json` uses adjacent whole batches. Its confidence intervals were inconclusive for two workloads; it failed the acceptance check. Keep that evidence rather than treating its low medians as a speedup.

`linux-node24-interleaved.json` alternates order for each operation within nine paired samples. There are 512 operations per sample for `/usr/bin/true` and 64 for each Node workload. This reduces the effect of OS load/CPU scaling between long batches. The acceptance check passed, including deterministic paired-bootstrap intervals within the 1.10 tolerance.

| Workload                            | Median SDK/native wall ratio | 95% bootstrap interval | Parent CPU ratio |
| ----------------------------------- | ---------------------------: | ---------------------- | ---------------: |
| Native executable, inherited output |                        1.003 | 0.991–1.007            |            1.009 |
| Node child, inherited output        |                        1.012 | 0.947–1.037            |            1.033 |
| Dual 1 MiB binary capture           |                        1.013 | 1.005–1.020            |            1.102 |
| 1 MiB stdin and text capture        |                        1.006 | 0.977–1.038            |            1.018 |

Parent CPU excludes child CPU and should not be confused with total work: dual capture uses about 10% more parent CPU in this run, while total wall time differs by about 1.3%. Cancellation, concurrency and process trees are not timing conclusions.

Observed parent RSS increases for dual capture were about 4.4–4.5 MiB at 1 MiB per stream and 33.3–34.3 MiB at 8 MiB per stream for both implementations. These isolated 1 ms samples include a post-settlement observation; they are not hard peak-memory bounds. Retained chunks, concatenation and decoded strings cost memory beyond the visible byte limits.

Cold startup plus one empty Node child had medians of 84.8 ms for native coordination, 91.3 ms for the standalone SDK, and 567.5 ms for the Twill source loader. The loader compiles the surrounding script once; it is not a per-command cost or an SDK production dependency. Prebuild/export scripts for native execution when startup matters. The `execFile` reference has its own raw capture samples and is not the `spawn` gate.

From a built checkout:

```sh
pnpm benchmark:shell --output ../../shell-results.json --verify-performance
```

Inconclusive measurements fail the check. No samples are discarded, and a low median alone does not establish a general speedup.
