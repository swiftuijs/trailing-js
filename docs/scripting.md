# Shell scripting

Twill scripts combine native Node APIs with Swift-inspired `guard`, trailing closures and `defer`. The unreleased source runner supports a standard executable script:

```twill
#!/usr/bin/env twill
console.log(process.argv.slice(2));
```

Save it as `hello.twill`, give it executable permission and run it with `twill` on PATH:

```sh
chmod +x hello.twill
./hello.twill 'hello world'
```

With a project-local compiler, the package manager supplies PATH:

```sh
pnpm exec ./hello.twill 'hello world'
pnpm exec twill hello.twill 'hello world'
pnpm exec twill run hello.twill 'hello world'
```

The explicit `twill` forms work on Windows too. POSIX executable permission and shebang execution apply to Linux/macOS. Extensionless entry scripts work as well. The runner is supplied by `@swiftuijs/twill`; the subprocess SDK is optional. **The runner and SDK are source prototypes, not npm 0.1.2 features.** Use the deliberately built source packages until a coordinated release is published.

All arguments after the script path are forwarded unchanged, including `--help`, `-p`, `--` and shell metacharacters. Use `twill run -- <file>` for a filename beginning with a dash, or `twill run check` for a filename matching a compiler subcommand. `process.argv` has the normal Node shape: executable, absolute script path, then arguments.

Execution uses the current Node process, native stdin/stdout/stderr, unchanged cwd/environment and the script's own exit status and signal behavior. Imports resolve from the script's location, so making `twill` available globally does not install its application dependencies globally. Configuration still comes from the nearest source project. Source maps are enabled; native `.ts`/`.js` imports and top-level await keep their normal loader meaning. Run `twill check` separately: running a script does not perform type checking. The CLI imports the entry module; `import.meta.main` / `require.main === module` do not identify it as Node's main module. Put executable code in a dedicated entry file and reusable code in imported modules.

The published 0.1.2 loader remains available for advanced Node integration:

```sh
node --enable-source-maps --import @swiftuijs/twill/register scripts/build.twill
```

## Repeated script startup (source-only)

The runner caches successfully compiled modules so subsequent fresh launches can skip loading the compiler. Each run still executes the script and its imports normally. Source content, compiler/dependency code and observed project configuration determine validity; editing an imported file or inherited config invalidates the affected module even if timestamps stay unchanged. Source maps keep their original filenames and text. The advanced Node loader above remains uncached by default.

Set `TWILL_CACHE=0` in the environment to disable caching:

```sh
TWILL_CACHE=0 twill scripts/build.twill
# PowerShell: $env:TWILL_CACHE = '0'; twill scripts/build.twill
```

The default directory is `~/.twill/script-cache-v1`. `TWILL_CACHE_DIR` can select an absolute private directory; deleting that directory clears it. Cache files include original source through maps, so disable caching for source you do not want stored. POSIX ownership/permissions and regular-file checks reject unsafe locations; Windows uses the selected directory's inherited user-profile ACL, which Node does not validate. Treat custom directories as user-trusted. Unavailable locations, corrupt entries and cache I/O errors fall back to compilation without changing script output.

Completed storage uses 128 slots of at most 512 KiB each (64 MiB total, excluding filesystem overhead and concurrent temporary files). Collisions or larger modules compile normally. Caching and the runner are unreleased source features; npm 0.1.2 is unchanged. Native exported/prebuilt JavaScript still avoids compiler work on its first launch.

## Optional subprocess SDK (unreleased)

**`@swiftuijs/twill-shell` is a source prototype, not an npm release.** Its local 0.1.2 manifest is a coordinated checkout version. Use these APIs only with a deliberately built source package. Ordinary npm 0.1.2 applications can use native `node:child_process` today.

The SDK takes its API direction from [Swift Subprocess](https://github.com/swiftlang/swift-subprocess): immutable commands, explicit input/output policies, typed status and owned process teardown. The execution backend calls native Node `spawn` / libuv directly with `shell: false`. It never translates a command into TypeScript or loads the Twill compiler. Native JS/TS can use it independently; Twill's loader only compiles the surrounding script when loaded.

This checkout implements an optional Rust backend in the separate `@swiftuijs/twill-shell-native` package. Select it explicitly by importing `Subprocess` from that package; commands, policies, declarations and error classes are shared with the SDK. It is **not published on npm 0.1.2**. The Node SDK remains independent and uses Node/libuv. The earlier Linux-only experiment and its measurements remain historical evidence.

## Optional Rust backend (unreleased)

```ts
import { Command, Output, Subprocess } from '@swiftuijs/twill-shell-native';
const result = await Subprocess.run(Command.name('git', ['status', '--short']), {
  output: Output.text({ limit: 1024 * 1024 }),
  timeoutMs: 10_000,
});
console.log(result.standardOutput);
```

The same import works in a Twill shebang script. One Rust async reactor per Node environment multiplexes native child waits and pipe readiness, independently of libuv's shared worker pool. It implements the input/output, status/error, cancellation and bounded direct-child ownership contract below. Unix cancellation requests SIGTERM before forced termination; Windows uses native process-handle termination. Worker teardown cancels only that environment's commands. Explicit `process.exit()` uses a native cleanup barrier bounded to 1.1 seconds, during which JS promise callbacks cannot run. OS launch/uninterruptible kernel waits prevent a hard real-time guarantee; SIGKILL and native faults cannot run exit handlers. Descendants and pipelines remain outside direct-child ownership.

Native execution snapshots cwd/environment and copies byte input before returning to JS. Captured bytes transfer native storage through N-API where supported, followed by one UTF-8 decode for text. Allocation/copy costs still apply; output byte bounds do not cap total RSS. Missing or incompatible native binaries reject before launch: there is no automatic fallback, installation-time Rust build, runtime download or library path override.

Prebuilds target Linux glibc x64/arm64, macOS x64/arm64 and Windows x64. Linux needs kernel 5.3+ with `pidfd_open` permitted; the initial Linux builds target Ubuntu 24.04/glibc 2.39+. Other platforms, including musl and Windows ARM, need separate validated builds. Source development requires the pinned Rust 1.90.0 toolchain. Platform CI tests real children on Node 22 and independently installed archives on Node 20.19.0; release assembly verifies all five binaries from one pinned source. The original SDK retains its 16 KiB compressed budget; native has separate 2 MiB-per-binary and 6 MiB compressed-archive gates.

For a deliberate source installation:

```sh
pnpm --filter @swiftuijs/twill-shell-native... build
pnpm --filter @swiftuijs/twill-shell-native test:coverage
pnpm package:native
# In an independent app, install both locally validated archives:
npm install /path/to/swiftuijs-twill-shell-0.1.2.tgz /path/to/swiftuijs-twill-shell-native-0.1.2.tgz
```

A local archive contains the host binary; coordinated release assembly requires all five validated targets. Neither archive is currently an npm release. [Performance](performance.md#optional-rust-backend) separates backend measurements from external-command work and source/compiler startup.

## Run a command

```twill
#!/usr/bin/env twill
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
pnpm --filter @swiftuijs/twill-shell exec twill examples/main.twill 'app, tests'
# POSIX: examples/main.twill has an executable shebang.
pnpm --filter @swiftuijs/twill-shell exec ./examples/main.twill 'app, tests'
pnpm --filter @swiftuijs/twill-shell test:coverage
```

A distributed JS application importing the SDK needs it as a production dependency. The compiler is only needed to load `.twill` source or build/export it. [Native source export](libraries.md) retains the ordinary SDK import, and the emitted JS runs without a compiler loader.

The first stage contains argv execution, bounded collection, status/errors, input, environment/cwd and cancellation. `withProcess`, `Output.stream`, pipelines and shell-tagged templates are not implemented. Continue using native Node APIs for those needs.

## Performance boundaries

The inherited/discarded path uses native descriptors without output capture. There is one native spawn and one settlement promise per run, no polling, no per-chunk promises and no per-command compilation. Capture reuses a single chunk when possible and otherwise concatenates once; text decoding occurs once at settlement.

The [native comparison harness](https://github.com/swiftuijs/twill/blob/main/packages/shell/benchmarks/run.mjs) retains paired raw samples, workload/environment details and source/build hashes. It compares successful direct-child work with equivalent handwritten `spawn` coordination using the same argv, stdio, capture limits and input. Parent CPU is reported separately from wall time. The local acceptance command checks a median wall-time ratio of at most 1.10 and requires the paired bootstrap interval to fit that tolerance; inconclusive data fails the check. Separate measurements retain native/SDK/Twill cold startup, an `execFile` capture reference and isolated 1 MiB/8 MiB capture-memory observations. These observations do not establish hard memory bounds or general speedups. Cancellation, concurrency and process trees are outside the timing workloads. See [performance](performance.md) and the contributor testing guide for measurement procedures.

[Recorded Linux/Node 24 samples](https://github.com/swiftuijs/twill/blob/main/packages/shell/benchmarks/results/README.md) measured SDK/native warm wall ratios of 1.003–1.013, with all paired 95% interval upper bounds below 1.04. Parent CPU is separate: dual capture used about 10% more parent CPU in this run. Native/SDK/source-loader cold medians were 84.8/91.3/567.5 ms including one child, so build/export source scripts when startup matters. These are environment-specific observations, not general speed or cold-source parity claims.

The executable runner has its own [cold-start report](https://github.com/swiftuijs/twill/blob/main/packages/twill/benchmarks/results/README.md). Fifteen paired Linux/Node 24 launches measured 520.8 ms for the existing loader and 475.0 ms for direct `twill` invocation, with no added regression in that sample. The runner skips compile/check/export tooling initialization and keeps the interpreter PID; source compilation still costs startup time. This is not a general speedup or native-Node cold-start parity claim.

The [source-only runner cache measurements](https://github.com/swiftuijs/twill/blob/main/packages/twill/benchmarks/results/README.md#compilation-cache-prototype) retain 21 fresh-interpreter pairs and compiler/dependency validation. On this Linux/Node 24 workload, uncached/empty-cache/cached/native medians were 513.6/544.3/157.3/43.9 ms. The paired cache-hit ratio was 0.2938 (95% interval 0.2826–0.3046); empty-cache paired overhead was about 7%. These are source-startup observations, not native parity, external-command acceleration or Rust measurements. A valid hit skips compiler initialization; prebuilt JavaScript remains the faster first-launch path.
