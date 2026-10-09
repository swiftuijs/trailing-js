# Native subprocess measurements

These Linux x64 / Node 24.19.0 samples describe this environment, not universal performance. JSON reports retain the workload, argv, input size, source/build SHA-256 identities, source commit, every paired timing/parent CPU sample, isolated memory observations and separate cold starts. The initial sections describe historical implementations; 0.3.0 replaces the 0.2.0 Rust addon with Node spawn/streams. Their hashes do not identify the replacement; the Node replacement sections below retain its exact identities. Reproduce the recorded fixture exactly from each report's `gitHead`.

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

The [complete first review](node-replacement-first-review-linux-node24.json) on
Linux x64 / Node 24.19.0 at `318dbb8` retains every warm, concurrency, memory,
filesystem, cancellation and cold sample. Eight of nine wall gates pass; 1 MiB
native dual capture is inconclusive (median 0.919, 95% interval 0.837–1.211), so
the unchanged complete gate rejects the run. The [failure log](node-replacement-first-review-linux-node24.log) is retained.

| Workload                     | SDK / handwritten Node wall | 95% paired interval | Gate         |
| ---------------------------- | --------------------------: | ------------------- | ------------ |
| native-executable-inherit    |                       1.009 | 0.993–1.030         | Pass         |
| node-inherit                 |                       1.002 | 0.999–1.013         | Pass         |
| native-dual-capture-1048576  |                       0.919 | 0.837–1.211         | Inconclusive |
| native-dual-capture-8388608  |                       0.998 | 0.969–1.035         | Pass         |
| node-dual-capture-1048576    |                       1.003 | 0.973–1.037         | Pass         |
| native-stdin-text-1048576    |                       1.020 | 1.006–1.040         | Pass         |
| native-duplex-1048576        |                       1.036 | 1.014–1.064         | Pass         |
| 32 concurrent Node children  |                       1.002 | 0.978–1.015         | Pass         |
| 128 concurrent Node children |                       1.000 | 0.993–1.014         | Pass         |

One predeclared [fresh-process recheck](node-replacement-capture-recheck-linux-node24.json)
verifies every unchanged source/build digest and repeats only that workload with
the same CPU 0, eleven pairs, 64 operations/pair, eight warmups, alternating
orders and bootstrap method. Its median is 0.976, interval 0.832–1.190: still
inconclusive. Retain its [exact diagnostic source](node-replacement-capture-recheck.mjs.txt)
and [failure log](node-replacement-capture-recheck-linux-node24.log). The diagnostic
records this workspace's absolute checkout paths; adjust them for reproduction
and retain the adjusted diagnostic identity. Neither run is a complete performance
acceptance, and no samples/counts/limits are changed or dropped to produce a pass.

Warm parent CPU is recorded separately. The Node 1 MiB producer has median CPU
ratio 1.189 with interval 0.777–1.330; those samples do not establish a systematic
CPU regression or improvement. Direct fresh Node/native-SDK medians are
52.4/55.6 ms; cached Twill baseline/SDK 166.7/177.0 ms; uncached 503.6/515.0 ms.
Memory and cleanup observations remain separate and establish no hard RSS or
real-time deadline guarantee. At this first review the replacement stayed under review while capture uncertainty
remained; subsequent assessments and the explicit 0.3.0 release decision below
preserve the result rather than convert it into a passing comparison.

## Isolated warm-process protocol

The interleaved coordinator comparison shares one V8 heap between both variants.
Its 1 MiB capture ratios alternate substantially in both directions, including
parent CPU, while larger-output ratios are much tighter. A release-candidate
review retains the failed interleaved run and investigates spontaneous GC rather
than discarding samples or changing the 1.10 gate.

`complete.mjs` now gives each warm sample its own `warm.mjs` process. Both modes
load identical modules and workload buffers, perform eight warmups, and run the
same checked operations. Launch order alternates per pair. All seven workloads,
eleven pairs, original operation counts, byte bounds, status checks and 10,000
bootstrap resamples remain. Every individual operation is retained. GC runs
naturally within the measured operations; no forced GC, filtering or increased
sample counts are used. Worker startup is outside warmed coordination timings
and remains a separate cold-start comparison. Memory, filesystem, cancellation
and the two 48-pair default-pool concurrency workloads keep their protocol.

This change separates variant heap/call-site feedback; it does not optimize the
SDK, prove GC caused every outlier, or reinterpret the rejected earlier runs.
Exactly one complete evaluation ran after this protocol correction.

The GC diagnostic retains the [trace](node-replacement-gc-diagnostic-linux-node24.log),
[observations](node-replacement-gc-diagnostic-linux-node24.json) and
[exact diagnostic source](node-replacement-gc-diagnostic.mjs.txt). It deliberately
uses `--trace-gc-nvp` and logging, so its timings are not acceptance samples.
Of 64 interleaved operations per variant, collection fell inside two native
operations and eight SDK operations; the five longest operations were SDK calls
with reported GC pauses. This demonstrates unequal GC attribution in that traced
process, not a causal explanation for every earlier sample. The recorded absolute
paths identify the inspected checkout; adapt and record those paths for reproduction.

The [isolated pre-fast-path report](node-replacement-isolated-before-fastpath-linux-node24.json)
and [log](node-replacement-isolated-before-fastpath-linux-node24.log) identify
`2d1578a` and reject three gates: inherited native launch upper bound 1.129,
1 MiB capture median/upper 1.218/1.240, and full duplex 1.124/1.173. Isolation
exposes a supported capture regression; it does not grant acceptance.

The runtime refinement removes duplicate materialization of default cwd/environment
state. Synchronous Node spawn captures inherited state before returning to JS;
explicit policies retain their existing handling. Real default/relative cwd,
environment and byte-input mutation tests remain, and an unlinked-current-directory
case compares actual SDK launch with natural Node. The production SDK changes,
so a new complete assessment is required with the unchanged isolated protocol,
workloads, operation counts, bootstrap and 1.10 gate. Earlier failures remain.

## Inherited-state fast-path review and withdrawn capture candidates

The [complete fast-path report](node-replacement-inheritance-fastpath-linux-node24.json)
and [failure log](node-replacement-inheritance-fastpath-linux-node24.log) identify
`502be6fd8c7a538f66e189fd6d9ef37fc91221a0`. This is the changed production SDK
with native default inheritance, evaluated once with the unchanged isolated
protocol. Seven of nine gates pass. Native 1 MiB capture is 1.171 (95% interval
1.043–1.232), and duplex is 1.113 (1.078–1.157); both fail the original 1.10 limit.
Native inherited launch is 0.993 (0.959–1.026); the default-pool 32/128-child
comparisons are 1.000/1.009 with upper bounds 1.009/1.025. Every operation and
remaining cold, memory, filesystem and cancellation observation is retained.
Functional/platform CI success does not replace this failed performance gate.

The [CPU diagnostic summary](node-replacement-capture-profiles-summary.json)
records four profiled worker executions (one natural baseline and three SDK
implementations), with the exact raw profiles and checked per-operation records.
All use the unchanged warm-worker 1 MiB capture workload. These are diagnostic
runs with profiling enabled, not new acceptance measurements. They include module
initialization and cannot demonstrate portable speedups or prove a single cause
of the remaining regression.

The original SDK profile records 508.7 ms wall / 326.3 ms parent CPU across its
64 measured operations. Clearing captured chunk references at settlement records
508.9/329.9 ms; a geometrically growing capture buffer records 664.0/466.0 ms.
These results did not justify adopting either candidate. Both changes and the
candidate-only tests/RFC text were withdrawn. The exact growing-source/build
snapshots and rejected patch remain here; the release-only source is reconstructed
from the recorded patch, explicitly without a contemporaneous digest. SHA-256
identities of the diagnostic files are retained in the summary. To reproduce,
use the baseline commit, apply the appropriate recorded source candidate, rebuild
and run the recorded profiling command; keep any changed output paths and identities.

No unchanged-source complete run is repeated to seek a pass.

## 0.3.0 release acceptance

On 2026-10-09 the maintainer explicitly accepted the measured shell overhead and
ended further optimization as a release blocker. The [review decision](node-replacement-0.3.0-acceptance.json)
identifies the unchanged final report, its SHA-256, runtime source/build hashes
and the two failed strict comparisons. All 46 recorded runtime/build/benchmark
identities match the accepted implementation. Native 1 MiB capture is about 17%
slower at the paired median (upper 95% bound about 23%); duplex is about 11%
slower (upper bound about 16%). These are synthetic direct-child coordination
costs, not acceleration or a universal scripting performance guarantee.

The optional 1.10 timing check still fails that report. This is explicit release
acceptance of the known costs, not a passing benchmark or relaxed correctness,
coverage, language-output performance or size check. Node OS contracts remain
validated on Linux, macOS and Windows; the retired Rust CPU/libc build matrix is
removed. Publish the accepted SDK before marking the old native registry package
deprecated, and keep 0.2.0 available for compatibility.
