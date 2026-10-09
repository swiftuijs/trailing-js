# Native subprocess measurements

These Linux x64 / Node 24.19.0 samples describe this environment, not universal performance. JSON reports retain the workload, argv, input size, source/build SHA-256 identities, source commit, every paired timing/parent CPU sample, isolated memory observations and separate cold starts. These reports describe historical implementations; the source checkout now replaces the 0.2.0 Rust addon with Node spawn/streams. Their hashes do not identify the replacement. Reproduce the recorded fixture exactly from each report's `gitHead`.

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

## Isolated Rust experiment

`rust-native-linux-node24.json` records the reviewed Linux-only N-API prototype at commit `2ac62ee32cdf7c741395456f1f6f0ec48c533627`, Rust 1.90.0, Node 24.19.0 and the same Xeon host. It includes every completed raw paired sample, source/build hashes (including all emitted Twill JS chunks), native artifact bytes, memory observations, concurrency and fresh interpreter starts. This is a successful direct-child subset, not the full SDK cancellation/error/ownership contract. Native SDK and Rust use the same literal argv, bytes, capture limits and inherited descriptors in timed cases. Rust snapshots input/environment and uses an experimental hard deadline; parent CPU includes native worker threads, excludes child CPU.

Eleven warm paired batches rotate all six operation orders within each batch. Each timed result's bytes/status are checked outside the timer. There are 512 operations per sample for `true`, 24 for an empty Node child, 64 for native 1 MiB capture/input/full duplex, 16 for native 8 MiB capture and 16 for Node 1 MiB capture. Eight warmups per variant precede each workload. C fixtures compile once outside timing and expose launch/coordination costs without a Node child interpreter.

| Workload                       | SDK wall median per operation | Rust wall median per operation | Paired Rust/SDK wall ratio | 95% interval | Paired parent CPU ratio |
| ------------------------------ | ----------------------------: | -----------------------------: | -------------------------: | ------------ | ----------------------: |
| `true`, inherited descriptors  |                       3.30 ms |                        1.92 ms |                      0.581 | 0.563–0.612  |                   0.467 |
| Empty Node child               |                      39.01 ms |                       35.94 ms |                      0.985 | 0.940–1.040  |                   0.490 |
| C producer, dual 1 MiB capture |                       9.23 ms |                        5.03 ms |                      0.582 | 0.478–0.608  |                   0.645 |
| C producer, dual 8 MiB capture |                      29.81 ms |                       26.10 ms |                      0.852 | 0.815–0.904  |                   0.869 |
| Node producer, dual 1 MiB      |                      53.45 ms |                       50.66 ms |                      0.898 | 0.879–0.976  |                   0.494 |
| C stdin and 1 MiB text capture |                      11.54 ms |                        6.10 ms |                      0.601 | 0.551–0.722  |                   0.677 |
| C stdin and dual 1 MiB capture |                      10.37 ms |                        5.60 ms |                      0.602 | 0.522–0.753  |                   0.602 |

The paired ratio is the median of each batch's Rust/SDK ratio; it is not the ratio of the independently selected wall medians, so the columns need not divide to the same number. Intervals use 10,000 deterministic paired bootstrap resamples. Short launch and 1 MiB native capture reduce paired wall time about 42%; 8 MiB capture reduces it about 15%. Empty Node launch does not establish a SDK speedup. Handwritten Node comparisons are retained in JSON; paired Rust/native wall ratios for short launch and 1/8 MiB native capture are 0.587/0.579/0.855. External commands perform unchanged work.

Five isolated memory pairs per size observe 1 ms samples plus settlement. At 1 MiB per stream, parent RSS-increase medians are native/SDK/Rust 4.25/4.13/2.31 MiB; at 8 MiB they are 33.59/33.21/16.30 MiB. This is a lower observed process RSS increment, not a hard memory limit or a portable zero-copy guarantee. V8 `external`/`arrayBuffers` can omit native allocator storage; RSS is the process comparison.

Five isolated concurrency pairs per pool configuration launch 32 Node children, each waiting 100 ms. Default four-worker pool wall medians are native/SDK/Rust 496/473/1,185 ms: about 2.5× SDK for this Rust prototype. With a 32-worker pool they are 467/477/456 ms. Both configurations are retained. Blocking a libuv worker per command is an adoption blocker; raising a global pool does not supply independent asynchronous ownership or avoid contention with unrelated Node work.

Eleven fresh-interpreter pairs time backend imports plus one `true` child, and actual Twill runner scripts with a validated cache hit or disabled cache. Direct native/SDK/Rust wall medians are 56.6/58.6/57.9 ms. Cached source SDK/Rust medians are 177.4/173.7 ms, but paired Rust/SDK ratio is 1.013 (0.904–1.047): no demonstrated improvement. Uncached source medians are 514.4/525.8 ms, paired ratio 1.018 (0.999–1.060). These are different workloads from the earlier one-Node-child/source startup reports. The addon does not remove the compiler or Node interpreter.

The stripped addon is 495,808 bytes (484 KiB) uncompressed. It is outside SDK tarball files and the existing 16 KiB compressed SDK gate. Windows/macOS, native containment, pipelines, graceful cancellation, bounded join and environment-shutdown ownership are not implemented. Keep the SDK backend until independent scheduling and full contracts/platforms are implemented and tested. See [experiment reproduction](https://github.com/swiftuijs/twill/blob/v0.2.0/packages/shell/experiments/rust-native/README.md) and [RFC 0036](../../../../docs/rfcs/0036-native-subprocess-backend.md).

`rust-native-initial-diagnostic.log` and `.json` retain an incomplete diagnostic run at `1069b3d`. It completed timings but failed constructing the final report because the harness expected an unbundled `compilation-cache.js` filename. In-memory raw samples were lost, so those logged medians are not acceptance evidence and cannot supply a confidence interval. The revised harness validates all fingerprints before timing and checkpoints every completed paired batch. It also snapshots inherited environment at call time, includes queue delay in its deadline and reuses the capture read buffer. The complete report above describes that corrected implementation; the incomplete diagnostic is not silently discarded or reconstructed.

## Node replacement validation

The source replacement uses `benchmarks/complete.mjs` and retains seven warm workloads, eleven paired samples each, plus 48 pairs for both default-pool 32/128-child workloads. It retains memory, filesystem, cancellation and direct/cached/uncached startup observations and every source/build hash. The unchanged paired median/upper 95% wall limit is 1.10. The handwritten baseline also copies byte input, matching the public snapshot contract. Historical Rust speedups and numeric-signal/abrupt-disposal guarantees are not replacement results.
