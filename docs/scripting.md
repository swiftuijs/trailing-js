# Shell scripting

Twill scripts can combine native Node APIs with Swift-inspired `guard`, trailing closures and `defer`. The existing Node loader is published in `@swiftuijs/twill` 0.1.2:

```sh
node --enable-source-maps --import @swiftuijs/twill/register scripts/build.twill
```

Native `.ts`/`.js` imports and top-level await keep their normal meaning. Run `twill check` separately: loading a script does not perform type checking.

## Optional subprocess SDK (unreleased)

**`@swiftuijs/twill-shell` is a source prototype, not an npm release.** Its local 0.1.2 manifest is a coordinated checkout version. Use these APIs only with a deliberately built source package. Ordinary npm 0.1.2 applications can use native `node:child_process` today.

The SDK takes its API direction from [Swift Subprocess](https://github.com/swiftlang/swift-subprocess): immutable commands, explicit input/output policies, typed status and owned process teardown. The execution backend calls native Node `spawn` / libuv directly with `shell: false`. It never translates a command into TypeScript or loads the Twill compiler. Native JS/TS can use it independently; Twill's loader only compiles the surrounding script when loaded.

```twill
import { Command, Output, Subprocess } from '@swiftuijs/twill-shell';

guard const input = process.argv[2] else {
  throw new Error('Pass an input argument');
}
const result = await Subprocess.run(
  Command.path(process.execPath, [
    '-e',
    'process.stdout.write(JSON.stringify(process.argv[1]))',
    '--',
    input,
  ]),
  { output: Output.text({ limit: 64 * 1024 }), timeoutMs: 5000 },
);
console.log(result.standardOutput);
```

Spaces, quotes, `$`, newlines and shell operators remain one literal argument. This prevents shell interpretation; executable-specific option parsing still applies. Use the tool's `--` separator where supported. `Command.path` requires an absolute executable path. `Command.name` accepts a bare executable name and uses native PATH search, including Node's platform defaults when PATH is omitted. Prefer a trusted absolute path for controlled automation. Windows `.cmd`/`.bat` files are shell scripts, not directly executable binaries under this contract.

## Input, output and environment

Stdin defaults to EOF via `Input.none()`; stdout and stderr default to `Output.inherit()`, without capture buffers. A string or `Uint8Array` supplies stdin data; `Input.inherit()` explicitly inherits stdin. Writes use Node's native buffering/backpressure and close stdin. Byte views share their backing storage: do not modify or detach them until the promise settles.

Capture is explicit and bounded per stream:

| Policy                    | Result      | Behavior                                               |
| ------------------------- | ----------- | ------------------------------------------------------ |
| `Output.inherit()`        | `undefined` | Inherits the caller's output descriptor                |
| `Output.discard()`        | `undefined` | Uses the native null output descriptor                 |
| `Output.text({ limit })`  | `string`    | Captures up to the byte limit, then decodes UTF-8 once |
| `Output.bytes({ limit })` | `Buffer`    | Captures bytes without text decoding                   |

Each capture requires a finite positive integer byte limit within Node's buffer limit. Limits count bytes, not Unicode characters. Invalid UTF-8 follows Node's replacement-character behavior. Both captured streams drain concurrently. Overflow rejects after cleanup instead of silently truncating a successful result. On a failure, captured fields may contain the retained prefix; chunks beyond the limit are not retained. Limits bound retained stream bytes, not total RSS: concatenation and text decoding need additional memory. Use inherited/discarded output for large output that does not need to be returned; streaming is a later milestone.

`cwd` applies to the child, never `process.chdir`. `Environment.inherit(updates)` snapshots updates and uses the parent's environment at launch; an `undefined` value removes a key. `Environment.replace(values)` uses only those values. Windows keys are normalized case-insensitively. Concurrent runs do not mutate the parent environment or working directory. Commands snapshot/freeze argv at construction and may be reused; each run starts a distinct child. NUL characters and invalid/unknown options reject before launch.

## Results, errors and cancellation

Results expose `processIdentifier`, `standardOutput`, `standardError` and an ordinary TypeScript discriminated union:

```ts
type TerminationStatus =
  | { readonly kind: 'exited'; readonly code: number }
  | { readonly kind: 'signaled'; readonly signal: NodeJS.Signals };
```

`check` defaults to true. Nonzero/signal exits throw `ProcessExitError`, whose `result` contains status and captured output. `check: false` returns status for native `switch`/`if` handling; it does not hide launch, I/O, abort, timeout or output-limit failures. Exported classes distinguish `ProcessLaunchError`, `ProcessIOError`, `ProcessAbortError`, `ProcessTimeoutError`, `OutputLimitError` and `ProcessTeardownError`. They extend `ProcessError`; use native `try/catch` and `instanceof` rather than proposed typed-throws syntax.

Pass `signal` and/or `timeoutMs` to bound execution. An already-aborted signal starts nothing. On failure, the SDK requests SIGTERM, then SIGKILL after `gracePeriodMs` (default 250 ms). It waits for the directly owned child and I/O to close; `killTimeoutMs` bounds the join after forced termination (default 1000 ms). Node timers are scheduling bounds, not real-time deadlines. Windows termination follows Node's native behavior and cannot promise POSIX graceful handling. Owned listeners/timers are removed on settlement.

The first observed failure remains primary. `cleanupErrors` retains secondary failures; `unresolvedProcessIdentifier` identifies a child that could not be reaped within the bound. These cases reject, even with `check: false`. Error objects may contain bounded output and native causes; the SDK does not automatically log arguments, environment values or output. Choose what to expose in your application logs.

Ownership covers the direct child. Detached grandchildren and arbitrary process trees need a separate contract; killing a shell parent cannot establish tree cleanup. If a descendant retains a captured pipe after the parent exits, a timeout can close the SDK's owned descriptors without claiming to terminate that descendant.

## A Twill build-script example

The [complete example](https://github.com/swiftuijs/twill/blob/main/packages/shell/examples/build.twill) checks input with `guard`, trims a list using a trailing closure, gives a child an isolated working directory/environment and passes JSON on stdin. `defer` removes the temporary directory on success and failure. Real-process tests execute it through the loader, check types/declarations and export it for native JS execution.

For a source checkout:

```sh
pnpm install --frozen-lockfile
pnpm --filter @swiftuijs/twill-shell... build
pnpm --filter @swiftuijs/twill-shell exec node --enable-source-maps --import @swiftuijs/twill/register examples/main.twill 'app, tests'
pnpm --filter @swiftuijs/twill-shell test:coverage
```

A distributed JS application importing the SDK needs it as a production dependency. The compiler is only needed to load `.twill` source or build/export it. [Native source export](libraries.md) retains the ordinary SDK import, and the emitted JS runs without a compiler loader.

The first stage contains argv execution, bounded collection, status/errors, input, environment/cwd and cancellation. `withProcess`, `Output.stream`, pipelines, shell-tagged templates and `twill run` are not implemented. Continue using native Node APIs for those needs.

## Performance boundaries

The inherited/discarded path uses native descriptors without output capture. There is one native spawn and one settlement promise per run, no polling, no per-chunk promises and no per-command compilation. Capture reuses a single chunk when possible and otherwise concatenates once; text decoding occurs once at settlement.

The [native comparison harness](https://github.com/swiftuijs/twill/blob/main/packages/shell/benchmarks/run.mjs) retains paired raw samples, workload/environment details and source/build hashes. It compares successful direct-child work with equivalent handwritten `spawn` coordination using the same argv, stdio, capture limits and input. Parent CPU is reported separately from wall time. The local acceptance command checks a median wall-time ratio of at most 1.10 and requires the paired bootstrap interval to fit that tolerance; inconclusive data fails the check. Separate measurements retain native/SDK/Twill cold startup, an `execFile` capture reference and isolated 1 MiB/8 MiB capture-memory observations. These observations do not establish hard memory bounds or general speedups. Cancellation, concurrency and process trees are outside the timing workloads. See [performance](performance.md) and the contributor testing guide for measurement procedures.
