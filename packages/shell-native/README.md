# <img src="https://twill.evecalm.com/logo.png" alt="Twill hummingbird" align="right" width="40" height="40" /> Twill native shell backend

Optional Rust execution for Twill and ordinary Node scripts. One independent asynchronous reactor per Node environment coordinates direct children and their pipes without occupying libuv's shared worker pool. Native process creation runs synchronously on the calling Node thread, as Node spawn does; the reactor coordinates pipes, waits and cancellation for already-started children. OS launch may block the caller. Commands never invoke a shell or a compiler.

This implements the production direct-child backend contract; it is **not yet published on npm**. Published Twill 0.1.2 does not include this package. Install a validated source archive until a coordinated release provides the prebuilt package.

```ts
import { Command, Output, Subprocess } from '@swiftuijs/twill-shell-native';

const result = await Subprocess.run(Command.name('git', ['status', '--short']), {
  output: Output.text({ limit: 1024 * 1024 }),
  timeoutMs: 10_000,
});
console.log(result.standardOutput);
```

The same import works in `.twill` scripts, including `#!/usr/bin/env twill` entries. Native JS/TS scripts need no Twill compiler. Commands, policies, result types and error classes come from `@swiftuijs/twill-shell`, which remains the dependency-free Node implementation. Use either backend explicitly; native never silently falls back.

Literal argv, child-local cwd/environment, PATH lookup, EOF/inherited/text/binary stdin, inherited/discarded/bounded text/binary output, checked statuses, `AbortSignal`, timeout, grace period and bounded direct-child join follow the [shell contract](https://twill.evecalm.com/scripting). Byte input is copied before returning to JS; captured bytes transfer native storage through N-API where the host permits it. UTF-8 decoding and allocations remain measured costs. Capture limits are byte bounds, not total RSS limits.

Unix cancellation uses SIGTERM, then SIGKILL after the configured grace period. Windows pipe ACLs restrict access to their owner and SYSTEM; inherited child handles do not require named-pipe reconnection. Windows terminates through its native process handle and does not promise POSIX graceful signals. Failures preserve the first cause, report `cleanupErrors` and any `unresolvedProcessIdentifier`, and close owned pipes. Ownership covers the directly launched child; escaped descendants and pipelines require their own contracts. Worker termination cancels only that environment's children; its owning Node thread waits up to 1.1 seconds for reactor cleanup and releases the environment hook on that same thread. Explicit `process.exit()` runs a native cleanup barrier bounded to 1.1 seconds; OS launch/uninterruptible kernel waits prevent a hard real-time guarantee. It cannot deliver JS promise callbacks while the environment is exiting. SIGKILL and native process faults cannot run exit handlers.

The expanded source build targets Linux glibc x64/arm64 (glibc 2.28+), Linux musl x64/arm64 (musl 1.2.5+), macOS x64/arm64 and Windows x64/arm64. Linux selects its ABI from the running Node process and uses pidfd readiness when available. Older Node-supported kernels and pidfd-denying container policies use owned-child polling on the same reactor; timer/wakeup costs can differ. Other architectures/operating systems remain explicit unavailable-backend conditions. Installation has no Rust build hooks, runtime downloads or environment-selected library paths. A missing/incompatible binary fails before launch. Source development requires Rust 1.90.0 with rustfmt/clippy, and the repository's Node/pnpm versions:

```sh
pnpm --filter @swiftuijs/twill-shell-native... build
pnpm --filter @swiftuijs/twill-shell-native test:native
pnpm --filter @swiftuijs/twill-shell-native test:coverage
pnpm package:native
pnpm --filter @swiftuijs/twill-shell-native test:package
```

Each native binary has a 2 MiB uncompressed gate; the optional archive has a separate 6 MiB compressed gate. The original SDK's 16 KiB gate stays intact. Platform CI builds and exercises real binaries on Node 22 and minimum Node 20.19.0; release assembly requires all eight validated targets from the same pinned source and verifies their digests. Implementation readiness and npm publication are separate.

Controlled Linux/Node 24 readiness-path measurements reduce warm native launch/capture time by about 27–41% versus the Node SDK, with 32/128-child concurrency comparable to handwritten Node. Denied-pidfd polling adds short-command latency: a focused diagnostic measured about 8% higher median time than handwritten Node, with a 95% interval of 7–11%. Cold startup has no demonstrated improvement; these results do not predict external-command speed or other platforms. See the [complete reports, eight-target package evidence and retained review history](https://github.com/swiftuijs/twill/blob/main/packages/shell-native/benchmarks/results/README.md).

See [Twill](https://twill.evecalm.com/), [performance](https://twill.evecalm.com/performance), [RFC 0036](https://github.com/swiftuijs/twill/blob/main/docs/rfcs/0036-native-subprocess-backend.md) and the sibling [SwiftUI.js](https://swiftuijs.evecalm.com/) project.

Environment replacement follows native Node boundaries: Windows supplements omitted libuv-required system variables (including PATH, SYSTEMROOT and TEMP) from the parent; explicit empty strings override those defaults. Node coverage output settings propagate when not explicitly supplied. Use a trusted executable path rather than assuming an omitted Windows PATH disables lookup.
