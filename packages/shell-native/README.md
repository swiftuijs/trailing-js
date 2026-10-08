# <img src="https://twill.evecalm.com/logo.png" alt="Twill hummingbird" align="right" width="40" height="40" /> Twill native shell backend

Prebuilt implementation dependency of [`@swiftuijs/twill-shell`](https://www.npmjs.com/package/@swiftuijs/twill-shell), available in 0.2.0. Applications install and import the SDK, which loads this package automatically. This package has no separate `Subprocess` API and does not depend on the SDK.

```ts
import { Command, Output, Subprocess } from '@swiftuijs/twill-shell';
const result = await Subprocess.run(Command.name('git', ['status', '--short']), {
  output: Output.text({ limit: 1024 * 1024 }),
  timeoutMs: 10_000,
});
console.log(result.standardOutput);
```

One independent asynchronous reactor per Node environment owns direct children and their pipes. Native process creation runs synchronously on the calling Node thread and may block it. No libuv worker is occupied per command, and commands never invoke a shell or compiler. Native JS/TS needs no Twill compiler.

Literal argv, child-local cwd/environment, PATH lookup, EOF/inherited/text/binary stdin, inherited/discarded/bounded text/binary output, checked statuses, `AbortSignal`, timeout, grace period and bounded direct-child join follow the [shell contract](https://twill.evecalm.com/scripting). Byte input is copied before returning to JS; captured bytes transfer native storage through N-API where the host permits it. UTF-8 decoding and allocations remain measured costs. Capture limits are byte bounds, not total RSS limits.

Unix cancellation uses SIGTERM, then SIGKILL after the configured grace period. Windows pipe ACLs restrict access to their owner and SYSTEM; inherited child handles do not require named-pipe reconnection. Windows terminates through its native process handle and does not promise POSIX graceful signals. Failures preserve the first cause, report `cleanupErrors` and any `unresolvedProcessIdentifier`, and close owned pipes. Ownership covers the directly launched child; escaped descendants and pipelines require their own contracts. Worker termination cancels only that environment's children; its owning Node thread waits up to 1.1 seconds for reactor cleanup and releases the environment hook on that same thread. Explicit `process.exit()` runs a native cleanup barrier bounded to 1.1 seconds; OS launch/uninterruptible kernel waits prevent a hard real-time guarantee. It cannot deliver JS promise callbacks while the environment is exiting. SIGKILL and native process faults cannot run exit handlers.

The release includes Linux glibc x64/arm64 (glibc 2.28+), Linux musl x64/arm64 (musl 1.2.5+), macOS x64/arm64 and Windows x64/arm64. Linux identifies standard dynamically linked Node builds from bounded ELF interpreter reads, retaining the Node-report fallback for unavailable/static/unfamiliar layouts, and uses pidfd readiness when available. Older Node-supported kernels and pidfd-denying container policies use owned-child polling on the same reactor; timer/wakeup costs can differ. Other architectures/operating systems remain explicit unavailable-backend conditions. Installation has no Rust build hooks, runtime downloads or environment-selected library paths. A missing/incompatible binary fails before launch. Source development requires Rust 1.90.0 with rustfmt/clippy, and the repository's Node/pnpm versions:

```sh
pnpm --filter @swiftuijs/twill-shell... build
pnpm --filter @swiftuijs/twill-shell-native test:native
pnpm --filter @swiftuijs/twill-shell-native test:coverage
pnpm package:native
pnpm --filter @swiftuijs/twill-shell-native test:package
```

Each native binary has a 2 MiB uncompressed gate; the implementation archive has a separate 6 MiB compressed gate. The SDK's 16 KiB gate stays intact. Platform CI builds and exercises real binaries on Node 22 and minimum Node 20.19.0; release assembly requires all eight validated targets from the same pinned source and verifies their digests. Implementation readiness and npm publication are separate.

The 0.2.0 public SDK's controlled Linux/Node 24 report passes all seven warm and both default-pool gates. Warm native launch/capture/input time is about 35–44% lower than equivalent handwritten Node; Node interpreter launch and 32/128-child concurrency are comparable. Fresh native/SDK startup medians are 62.9/70.0 ms; cached Twill source is 207.3/223.8 ms, without established cold-source parity. Historical denied-pidfd polling adds short-command latency: about 8% higher median time, with a 95% interval of 7–11%. These results do not predict external-command speed or other platforms. See the [complete reports, eight-target package evidence and retained review history](https://github.com/swiftuijs/twill/blob/main/packages/shell-native/benchmarks/results/README.md).

Darwin registration races for already exiting owned children retain polling and reaping instead of reporting a process failure; other notification errors remain failures.

See [Twill](https://twill.evecalm.com/), [performance](https://twill.evecalm.com/performance), [RFC 0036](https://github.com/swiftuijs/twill/blob/main/docs/rfcs/0036-native-subprocess-backend.md) and the sibling [SwiftUI.js](https://swiftuijs.evecalm.com/) project.

Environment replacement follows native Node boundaries: Windows supplements omitted libuv-required system variables (including PATH, SYSTEMROOT and TEMP) from the parent; explicit empty strings override those defaults. Node coverage output settings propagate when not explicitly supplied. Use a trusted executable path rather than assuming an omitted Windows PATH disables lookup.

## Development

This package's implementation uses Twill and emits ordinary JavaScript. Build and check a checkout with the workspace tools; see [developing tooling in Twill](https://github.com/swiftuijs/twill/blob/main/docs/contributing/dogfooding.md) for bootstrap and contribution instructions.
