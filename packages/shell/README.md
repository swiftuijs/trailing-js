# <img src="https://twill.evecalm.com/logo.png" alt="Twill hummingbird" align="right" width="40" height="40" /> Twill shell

Swift-inspired subprocess tools for Twill and ordinary Node JS/TS scripts. **Unreleased RFC 0034 source prototype; this package is not published on npm.** The manifest's 0.1.2 is the coordinated checkout version, not an available registry release.

Commands use native Node `spawn` / libuv with explicit argv and `shell: false`. The SDK has no production dependencies, compiler, TS engine, generated command code or global process settings. TypeScript declarations check calls; execution goes directly to the operating system.

```ts
import { Command, Output, Subprocess } from '@swiftuijs/twill-shell';

const result = await Subprocess.run(Command.name('git', ['status', '--short']), {
  output: Output.text({ limit: 64 * 1024 }),
  timeoutMs: 5000,
});
console.log(result.standardOutput);
```

Use `Command.path(absolutePath, args)` for a trusted executable; `Command.name(name, args)` uses native PATH search. Arguments are immutable snapshots and remain literal strings, including spaces, quotes, newlines and shell metacharacters. Tool-specific options still matter: use `--` before user-supplied filenames when the executable supports it.

Stdin defaults to EOF; stdout/stderr inherit without capture. `Input.inherit()` inherits stdin; a string or `Uint8Array` writes input with native backpressure. Keep byte input unchanged until completion. `Output.text({limit})` and `Output.bytes({limit})` require positive byte limits; `Output.discard()` retains nothing. Output-limit failure rejects after teardown, never returns silent truncation. Capture limits bound retained stream bytes, not total process memory or the final UTF-8 string/concatenation allocation.

A successful result contains `processIdentifier`, `terminationStatus`, `standardOutput` and `standardError`. Nonzero/signal exits reject with `ProcessExitError`; `check: false` returns that status. Launch/I/O failures, abort, timeout and output overflow always reject. Use ordinary `try/catch` and exported error classes. Errors can carry bounded output and native causes; the SDK never logs them automatically.

`cwd` and `Environment.inherit(updates)` / `.replace(values)` apply only to the child. Pass an `AbortSignal` or `timeoutMs` for cancellation. The default grace period is 250 ms before forced termination, followed by at most 1000 ms joining time. Settlement normally waits for child close and owned I/O. Failed teardown reports `unresolvedProcessIdentifier` and `cleanupErrors`, preserving the first failure. Ownership covers the direct child; descendants and arbitrary process trees are outside this contract. Windows uses Node's native termination behavior, without POSIX graceful-signal guarantees.

This first stage does not implement scoped streaming, pipelines, shell templates or a dedicated CLI runner. Node ESM is required (`^20.19.0 || >=22.12.0`). Twill source execution uses its existing loader; exported/native JS only needs this SDK. See the [scripting guide](https://twill.evecalm.com/scripting), [RFC 0034](https://github.com/swiftuijs/twill/blob/main/docs/rfcs/0034-shell-scripting-toolkit.md) and [official AI skill](https://twill.evecalm.com/ai). Twill's sibling UI project is [SwiftUI.js](https://swiftuijs.evecalm.com/).
