# Rust subprocess experiment

An explicitly selected Linux/N-API experiment for [RFC 0036](../../../../docs/rfcs/0036-native-subprocess-backend.md). This is not an implementation selectable through `@swiftuijs/twill-shell`, an npm package or a Rust interpreter. The existing SDK continues to use Node/libuv. This directory is outside the SDK's published files; its production dependencies and 16 KiB archive budget stay unchanged.

One N-API asynchronous operation owns a direct child, Linux pidfd and nonblocking pipes. One `poll` loop writes stdin and drains stdout/stderr fairly, reusing a read buffer. Inherited/discarded output bypasses capture. Capture retains a bounded vector and transfers it to a Node buffer; N-API can copy on hosts that disallow external buffers, and vector growth/UTF-8 decoding still allocate. Neither the byte limit nor Rust ownership is a total RSS cap.

The adapter snapshots environment and input before asynchronous work starts. It accepts literal argv, cwd, replacement environments, EOF/text/bytes input, inherited/discarded/bounded text/bytes output, status and `check`. Native validation rejects NUL and invalid bounds before launching. It never invokes a shell, changes parent globals or logs captured data.

## Reproduce

Requirements: Linux with pidfd support (kernel 5.3+), a C compiler, the repository's Node/pnpm versions and Rust 1.90.0. The checked-in toolchain file requests rustfmt/clippy, and `Cargo.lock` pins native dependencies. There are no prebuilt downloads or npm install hooks. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @swiftuijs/twill-shell... build
cd packages/shell/experiments/rust-native
cargo fmt --check
cargo clippy --locked --release -- -D warnings
node build.mjs
node --expose-gc --test test.mjs
node benchmark.mjs > target/results.json
```

The tests compile an independent C producer and exercise real children, exact bytes, split Unicode, dual capture beyond pipe capacity, stdin backpressure, child-local environment/cwd, statuses, failed launch/write, overflow, deadlines, reaping, descriptor-retaining descendants, concurrent settlement and stable descriptor counts. CI repeats the real addon tests on Node 20.19.0 after the Node 22 run. The experiment deliberately has no Windows/macOS implementation.

The benchmark compares Rust, the current SDK and natural handwritten Node `spawn` coordination. Eleven paired batches rotate all six operation orders; every timed result is checked. C producers expose coordination/capture costs separately from Node child startup. Parent CPU includes Rust worker threads and excludes child CPU. Separate fresh processes measure observed capture memory, 32 parallel children with default/expanded libuv pools, backend cold startup and actual Twill runner startup with cache enabled/disabled. Build fingerprints are validated before timing; partial samples are checkpointed under ignored `target/`. Complete reports and the initial incomplete diagnostic are retained in [benchmark results](../../benchmarks/results/README.md).

## Limits before SDK adoption

The native experiment uses generic errors and immediate direct-child termination on failure. It does not implement `AbortSignal`, the SDK's graceful teardown/structured error contract, inherited stdin, environment-update policies, process groups/Job Objects, scoped streams or pipelines. The adapter rejects unsupported options rather than claiming parity. Returned successful statuses/bytes match the compared SDK subset; that is not proof of the full SDK contract.

Each active operation occupies a libuv worker. The deadline starts after validation/snapshot, includes queue delay and rejects expired work before launch. Blocking OS launch/reap can outlast it, so it is not the SDK's bounded-join contract. A descendant can outlive the direct child; the experimental deadline closes retained pipes but does not own the descendant. The test explicitly cleans up that fixture. Panics unwind through owned-resource guards and are caught before returning across N-API; unrecoverable allocation/native faults remain process faults.

Measure concurrency and native artifact bytes alongside the faster sequential paths. A production backend needs independent asynchronous scheduling, environment shutdown/cancellation ownership, the full SDK contract suite, real platform implementations and justified prebuild/package budgets. Changing the implementation language alone does not satisfy those gates or eliminate Twill compiler/Node startup.
