# <img src="https://twill.evecalm.com/logo.png" alt="Twill hummingbird" align="right" width="40" height="40" /> Twill shell

Swift-inspired subprocess tools for Twill and ordinary Node JS/TS scripts, available in 0.2.0.

```sh
npm install @swiftuijs/twill-shell
# For .twill source scripts:
npm install --save-dev @swiftuijs/twill
```

Commands execute through one Rust process engine with literal argv, without shell interpretation or command compilation (`shell: false`). The prebuilt implementation dependency installs automatically; users need no Rust toolchain and do not choose a backend. Native JS/TS needs no Twill compiler. One async reactor per Node environment coordinates already-started children and pipes independently of libuv's worker pool.

Supported prebuilds: Linux glibc x64/ARM64 (glibc 2.28+), Linux musl x64/ARM64 (musl 1.2.5+), macOS x64/ARM64 and Windows x64/ARM64. Missing/incompatible binaries and unsupported platforms reject before launch, without fallback, install-time builds or downloads. See [performance](https://twill.evecalm.com/performance#rust-shell-backend) for measured warm gains and cold/polling limits.

```twill
#!/usr/bin/env twill
import { Command, Output, Subprocess } from '@swiftuijs/twill-shell';

const result = await Subprocess.run(Command.name('git', ['status', '--short']), {
  output: Output.text({ limit: 64 * 1024 }),
  timeoutMs: 5000,
});
console.log(result.standardOutput);
```

The compiler runner supplies the `twill` binary. Save this as `status.twill`, then use `twill status.twill` or `twill run status.twill`. On Linux/macOS, `chmod +x status.twill` enables `./status.twill` when `twill` is on PATH; `pnpm exec ./status.twill` uses a project-local binary. Windows uses the explicit CLI. Arguments after the script path pass through unchanged. Application dependencies resolve from the script's location. Use the compiler and SDK from 0.2.0 or newer.

Use `Command.path(absolutePath, args)` for a trusted executable; `Command.name(name, args)` uses native PATH search. Arguments are immutable snapshots and remain literal strings, including spaces, quotes, newlines and shell metacharacters. Tool-specific options still matter: use `--` before user-supplied filenames when the executable supports it.

Stdin defaults to EOF; stdout/stderr inherit without capture. `Input.inherit()` inherits stdin; a string or `Uint8Array` writes input with native backpressure. Byte input is copied at submission; cwd and environment are snapshotted then. `Output.text({limit})` and `Output.bytes({limit})` require positive byte limits; `Output.discard()` retains nothing. Output-limit failure rejects after teardown, never returns silent truncation. Capture limits bound retained stream bytes, not total process memory or the final UTF-8 string/concatenation allocation.

A successful result contains `processIdentifier`, `terminationStatus`, `standardOutput` and `standardError`. Nonzero/signal exits reject with `ProcessExitError`; `check: false` returns that status. Launch/I/O failures, abort, timeout and output overflow always reject. Use ordinary `try/catch` and exported error classes. Errors can carry bounded output and native causes; the SDK never logs them automatically.

`cwd` and `Environment.inherit(updates)` / `.replace(values)` apply only to the child. Pass an `AbortSignal` or `timeoutMs` for cancellation. The default grace period is 250 ms before forced termination, followed by at most 1000 ms joining time. Settlement normally waits for child close and owned I/O. Failed teardown reports `unresolvedProcessIdentifier` and `cleanupErrors`, preserving the first failure. Ownership covers the direct child; descendants and arbitrary process trees are outside this contract. Windows uses its native process handle for termination, without POSIX graceful-signal guarantees.

This first stage does not implement scoped streaming, pipelines, shell templates or shell-text execution. Node ESM is required (`^20.19.0 || >=22.12.0`). Twill source execution uses its existing loader; exported/native JS only needs this SDK. See the [scripting guide](https://twill.evecalm.com/scripting), [RFC 0034](https://github.com/swiftuijs/twill/blob/main/docs/rfcs/0034-shell-scripting-toolkit.md) and [official AI skill](https://twill.evecalm.com/ai). Twill's sibling UI project is [SwiftUI.js](https://swiftuijs.evecalm.com/).

Worker termination cancels that environment's children. Explicit `process.exit()` and environment teardown use a native cleanup barrier bounded to 1.1 seconds; JS callbacks do not run during exit. OS creation/uninterruptible kernel waits are not hard real-time guarantees, and SIGKILL/native faults cannot run cleanup handlers.
