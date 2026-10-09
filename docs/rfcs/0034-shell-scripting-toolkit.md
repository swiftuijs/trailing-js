# RFC 0034: Swift-inspired shell scripting toolkit

**Release reference:** 0.2.0 implements the accepted scope; broader/deferred items below remain proposals.
**Status:** Implemented in 0.2.0 for the accepted scope; deferred capabilities remain proposals.
**Kind:** Tooling / optional Node SDK.
**Release:** 0.2.0 (initial SDK); 0.3.0 (Node simplification).
**Dependencies:** RFC 0026 for executing Twill sources; RFCs 0002, 0007 and 0009 supply optional application syntax. No dependency on proposed typed throws, argument labels or structured-concurrency syntax.

## Accepted simplification amendment

The maintainer has withdrawn the native subprocess backend: it coordinates child
processes rather than interpreting Twill, and its addon, reactor and eight-target
release chain exceed the intended toolkit scope. The 0.3.0 implementation
uses Node's `child_process.spawn` and streams directly. Remove
`@swiftuijs/twill-shell-native`, its Rust experiment, ABI selection, binary builds
and native release assembly. Keep the Twill runner, shebang, optional
`@swiftuijs/twill-shell` import, command/policy/result/error API and 16 KiB SDK
archive gate. The compiler remains a development dependency of the SDK.

Preserve literal argv with `shell: false`, synchronous cwd/environment snapshots,
byte-input copies, simultaneous bounded capture, single UTF-8 decoding, checked
status, primary/secondary errors, abort/timeout and bounded failed-operation
teardown. Reuse Node's platform process behavior rather than recreate OS process
control, an interpreter, a supervisor or alternate backends. Preserve the public
signal union for declaration compatibility; emitted statuses follow Node,
including its limitation for unnamed Unix signals. This is an intentional loss of
the addon-specific numeric-signal guarantee, not a new status inference.

Normal operations own the direct child and pipes through settlement. Applications
must cancel and await outstanding operations before leaving a worker or forcing
process exit. Abrupt `Worker.terminate()` and `process.exit()` do not execute an
asynchronous join; remove the native 1.1-second environment cleanup guarantee.
Use `process.exitCode` after awaited work, and cooperative worker cancellation.
Neither version contains descendants or supplies process-tree semantics.

Validate public contracts on Linux, macOS and Windows and independently installed
archives on Node 20.19. Keep coverage thresholds and the equivalent handwritten
Node performance limit (paired median and upper 95% bound at most 1.10) unchanged.
Retain seven warm and both 32/128-child concurrency workloads, input/capture,
filesystem, memory, cancellation and cold-start observations. Keep conservative
base-to-head CI selection and full release validation; remove native compilation
and assembly rather than skip relevant JS/platform tests.

This amendment changes the execution implementation and abrupt-disposal boundary,
not Twill syntax or shebang dispatch. RFC 0036 and the 0.2.0 measurements remain
historical evidence in the tagged source. npm 0.2.0 still uses Rust; this source
change is neither merged nor published by design acceptance alone.

## Problem and native baseline

Twill already runs scripts using its published Node ESM loader:

```sh
node --enable-source-maps --import @swiftuijs/twill/register scripts/build.twill
```

Top-level await, Node modules, process arguments and native promises remain normal JS/TS. The 0.1.x compiler CLI compiled/checked/exported; 0.2.0 adds a reusable process toolkit and the accepted executable-script amendment below; installing the SDK is not a requirement to run a script.

Native `child_process.spawn` preserves arguments without a shell and offers streams, but each script must coordinate errors, exit status, output limits, cancellation, pipes and cleanup. `execFile` with promisify is a useful baseline for small captured commands; it rejects on unsuccessful exits and buffers output with a maximum size. A toolkit should reduce repeated coordination while keeping those native facilities available.

For a small script, the existing release can already do this:

```twill
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
guard const input = process.argv[2] else {
  throw new Error('Pass an input argument');
}
const result = await execute(process.execPath, [
  '-e',
  'process.stdout.write(JSON.stringify(process.argv[1]))',
  input,
]);
console.log(result.stdout);
```

The native baseline above was executed with the independently installed npm 0.1.2 compiler/loader on Node 24.19.0: five cases covered empty input, spaces/quotes, shell metacharacters, a newline and Unicode. Each child returned exactly its original argument. This validates existing script execution, not the proposed SDK.

An argument containing spaces, quotes, `$`, newlines or shell operators remains one literal argument. This example uses existing native facilities and released guard syntax, not the proposed SDK.

## Reference designs and recommendation

Use the official [Swift Subprocess package](https://github.com/swiftlang/swift-subprocess) as the primary API/ownership reference: named/path executables, argument arrays, reusable configuration, explicit bounded capture or streaming, discriminated termination status and a closure whose execution handle must not escape. The package distinguishes its collected-result API from interactive execution; output limits are byte limits. It does not supply a universal script shell.

[Google zx](https://github.com/google/zx) demonstrates convenient asynchronous scripting, shell-tagged templates, custom execution presets, pipes, cancellation and CLI use. Its [process API](https://google.github.io/zx/api) and [ProcessPromise](https://google.github.io/zx/process-promise) are comparison points. Twill can keep the conveniences without changing strings, promises or the process-wide working directory. A shell-backed command is explicit; argv-backed execution is the default.

Recommend a separate, optional **`@swiftuijs/twill-shell`** package with native TypeScript declarations, ordinary ESM JavaScript and Node's child-process/stream facilities. The compiler never inserts this dependency. It is separate from `@swiftuijs/twill-runtime`, which owns compiler-generated language helpers and must remain usable in browser bundles.

## First-stage SDK contract

### Command values and scoped options

```twill
import { Command, Environment, Output, Subprocess } from '@swiftuijs/twill-shell';

const status = Command.name('git', ['status', '--short']);
const result = await Subprocess.run(status, {
  cwd: projectDirectory,
  environment: Environment.inherit({ LANG: 'C' }),
  output: Output.text({ limit: 64 * 1024 }),
  error: Output.inherit(),
  check: true,
});
console.log(result.standardOutput);
```

The first-stage API below is implemented in 0.2.0. Later scoped/pipeline/shell examples remain proposals. Command construction does not spawn, execute callbacks or schedule work. `Command.name` uses the platform's normal executable search; `Command.path` requires an absolute executable path. Arguments are strings, in order, and go directly to the process executor without a shell. Reject invalid argument/options values and NUL characters before launch; do not coerce arbitrary objects into command text.

Treat a command as a reusable, readonly SDK value: snapshot the argv array once on construction, without claiming deep value semantics for JS objects. Each run creates a distinct child. `cwd` belongs to that child. Never call global `process.chdir`, modify `process.env`, patch prototypes or inject global `$` names.

`Environment.inherit(updates)` takes the parent's current environment at launch, applies a snapshot of updates, and permits explicit key removal with `undefined`. `Environment.replace(values)` uses only the supplied values; it may intentionally remove PATH. Handle Windows case-insensitive environment keys consistently. Options and argument expressions evaluate once, left to right, with ordinary JS rules; property getters keep their native behavior.

### Output, status and errors

MVP input defaults to no input. Output and error default to inherited terminal streams, avoiding buffering/copies. Explicit input uses `Input.inherit()` or supplies a string/Uint8Array; `Input.none()` explicitly selects EOF. Byte views are copied at submission; write respecting backpressure, finish stdin, and account for write errors. Capture is opt-in: `Output.text({ limit })` decodes UTF-8 once after successful close; `Output.bytes({ limit })` returns bytes; `Output.discard()` selects the native null descriptor without retaining output. A finite positive byte limit is required for capture. Exceeding it rejects with an output-limit error after child cleanup, without silently truncating output. Retained stream bytes are bounded; concatenation and decoded strings can require additional memory, so this is not a total RSS cap. Text decoding follows Node's normal replacement of invalid UTF-8. Streaming belongs to a later scoped API.

Return a typed result with `processIdentifier`, `terminationStatus`, `standardOutput` and `standardError`. Capture policy determines the corresponding output type (`string`, bytes or `undefined`). Status uses an ordinary TypeScript discriminated union:

```ts
type TerminationStatus =
  { kind: 'exited'; code: number } | { kind: 'signaled'; signal: NodeJS.Signals | number };
```

`check` defaults to true for build-script ergonomics: a nonzero exit or signal rejects with a `ProcessExitError` carrying the status and bounded captured output. `check: false` returns that status as data. This differs deliberately from Swift's status-first default. A launch/I/O failure, abort, timeout or output-limit failure always rejects regardless of `check`; it is not a fabricated numeric exit status. Use native try/catch and TypeScript error guards, not an unimplemented Swift `throws` contract. Logs must not automatically include command arguments, environment values or captured output; callers can choose what to print.

Promise completion occurs after the child closes and owned I/O finishes. A single completion coordinator settles exactly once when error/exit/close/abort events race, removes listeners/timers, and retains the primary cause; cleanup failures are attached as structured secondary errors rather than replacing it. Validate positive integer `timeoutMs`, nonnegative `gracePeriodMs` (default 250 ms) and positive `killTimeoutMs` (default 1000 ms), within Node timer bounds. Cancellation registration uses native `addAbortListener`, so another listener cannot suppress teardown with `stopImmediatePropagation`. On an already-aborted signal, launch nothing. Running abort/timeout initiates graceful termination followed by forced termination after the configured grace period, then waits for close within the forced join bound. Native termination/stream failures retain the primary cause and structured cleanup errors; unresolved live PIDs are explicit. Use Node-supported behavior per platform and test it.

MVP ownership covers the directly launched child, not arbitrary detached grandchildren or a cross-platform process tree. An explicit shell can create descendants; do not promise that killing its parent kills them. If the child cannot be terminated, report teardown failure with the unresolved process identifier; never report successful cancellation. Process groups/job objects require a separate reviewed extension.

### Swift-style scoped execution (second milestone)

A separate interactive API should mirror Swift's closure-based `run`:

```twill
await Subprocess.withProcess(Command.path(toolPath, ['--watch']), {
  output: Output.stream(),
  error: Output.inherit(),
}) { async execution in
  for await (const chunk of execution.standardOutput) {
    consume(chunk);
  }
};
```

The trailing closure lowers to an ordinary async callback. Explicit `async`/`await` and existing `guard`/`defer` add readability; no new syntax or compiler helper is required. `withProcess` owns the child and streams for the duration of the callback. Success waits for process completion; early return, throw or rejection initiates teardown and joins the child before the outer promise settles. A saved execution handle is unusable after the scope ends and its methods reject deterministically. TypeScript cannot prove non-escape; runtime checks and documentation are required. Do not return live owned streams from a completed scope. Stream readers must honor backpressure and bound any line-decoding buffer; writing and reading concurrently requires ordinary async code to avoid deadlock. Specify unread-stream draining/teardown before implementing this milestone.

### Pipelines and explicit shells (later milestones)

`Subprocess.pipeline([commandA, commandB], options)` accepts command values and spawns each stage once. Connect native streams with backpressure instead of capturing and copying intermediate output. Drain/inherit stderr independently. Start/connection failure or abort tears down and joins every owned stage; partial launch must not leave earlier children alive. Return each stage's status in command order. With checking enabled, any unsuccessful stage fails the pipeline, including upstream failure followed by a successful final stage. Broken pipes/SIGPIPE are not silently treated as success; callers opting out of checking can inspect statuses. These ownership/error rules need independent real-process tests before release.

An explicit `Shell.run(commandText, { executable, arguments, ... })` may provide native shell grammar for trusted command text. It must be visibly distinct from argv execution and document its descendants and platform semantics. Do not split a string into guessed arguments. POSIX quoting cannot be reused for PowerShell/cmd. A zx-style tagged template is deferred until interpolation, arrays, raw fragments and each supported shell's quoting have separate specification and adversarial tests. No implicit `cd`, glob, redirect or `|` syntax is added to `.twill`.

## Script execution and delivery

The first-stage source implementation provides the SDK's argv-backed `run`, bounded capture, status/error types, environment/cwd isolation and cancellation. Validate an actual `.twill` script through the existing loader, plus native JS/TS consumers. Document Node versions based on the tested SDK manifest; the compiler's Node support does not automatically validate this SDK.

### Accepted amendment: executable scripts

The user-facing entry is `twill script.twill [args...]`, with `twill run script.twill [args...]` as an explicit equivalent. On POSIX systems, `#!/usr/bin/env twill` plus executable permission enables `./script.twill`; `twill` must be on PATH. A local package-manager invocation also works without a global installation. This runner is part of the compiler's existing binary, not a second binary supplied by the optional SDK. The SDK remains compiler-independent.

Dispatch script execution before loading compile/check/export tooling or parsing compiler flags. Once the script path is selected, forward all remaining arguments literally, including `--help`, `-p`, `--runtime`, `--` and shell metacharacters. `run -- <file>` and `twill -- <file>` disambiguate filenames beginning with a dash. Compiler subcommand names remain reserved; `./check` or `run check` selects a file with that name. Execution does not type-check; `twill check` remains a separate step.

Run in the current Node process with inherited descriptors, unchanged cwd/environment and no intermediary child process. Before importing, set `process.argv` to `[process.execPath, absoluteScriptPath, ...scriptArguments]` and enable source maps. Preserve the script's own exit code, `process.exit`, uncaught exceptions/rejections and native signal behavior; do not replace a successful import with exit status zero, install global cleanup/signal handlers, or claim descendant ownership. Windows supports the explicit CLI forms; POSIX executable permission and shebang interpretation are not a Windows contract.

Register the existing loader relative to the installed binary, independent of cwd and project dependencies. Packages imported by the script resolve from the script's own location using Node's normal package rules, so a globally available compiler does not imply a globally available SDK. The loader selects the nearest Twill/TS configuration for each source file as before. An extensionless or otherwise non-native entry filename is explicitly identified to the loader as Twill; this affects only that entry, not native imports. Known native JS/TS extensions retain their existing module format and loader/Node treatment. The entry is dynamically imported: `import.meta.main` and `require.main === module` do not mark it as Node's main module. This documented boundary requires a dedicated executable entry, rather than changing metadata or using private Node bootstrap APIs. Do not scan for or silently download missing packages.

Retain the explicit Node loader form as an advanced integration interface. Compilation happens when loading source modules, never once per subprocess command. Measure the runner's cold startup separately against the existing loader and native Node; source execution still has compilation startup costs. Watch, caching, daemon execution, stdin/eval and shell text execution are not added by this amendment.

The SDK is a production dependency when distributed JS imports it. Source-only scripts also need the Twill compiler/loader available when invoked. Native-source export retains the ordinary SDK import and produces normal JS/types; do not bundle SDK internals or pretend this is a compiler-generated runtime dependency.

Implementation synchronizes the package README, public scripting/build guide, official application skill, changelog, examples, package/export validation and site navigation where useful. Do not advertise the source package as npm-installable. A source prototype and a published version must be distinguished.

## Lowering, costs and performance acceptance

The SDK has no parser/checker/formatter/highlight extension. Existing Twill callbacks/guards/defer lower using their established contracts. The native SDK API works with arrow callbacks and TypeScript unions. Do not require proposed enums, match, typed throws, argument labels or task groups; those would need their own accepted/released dependencies.

Compare against equivalent `spawn` coordination with the same argv, environment, output policy, byte limits and teardown, plus `execFile` where buffering semantics match. MVP targets one spawn, one settlement coordinator and one result per run, one argv snapshot per command, no shell launch for argv mode, no polling or per-output-chunk promise wrapping, no extra text/byte copies beyond bounded capture and final decoding. Inherited streams bypass capture and decoding. Pipelines must keep memory bounded independently of total intermediate bytes.

Measure child wall time separately from wrapper CPU/allocation/heap and launch latency; OS spawn variance can hide wrapper regressions. Preserve raw repeated samples, command/input identity, OS/Node and source/build hashes. Require no statistically supported wall-time regression beyond the agreed 10% tolerance against equivalent native coordination, and inspect allocations/large-output throughput independently. Inconclusive noisy data is not proof of parity. The SDK improves ownership, error handling and maintenance; it must not claim faster execution of external programs. Keep compile/load cold-start cost separate from steady-state process execution.

## Compatibility and alternatives

Native `child_process`, zx and other JS SDKs remain available directly in Twill. Users needing a complete shell language can invoke that shell explicitly. Adopting the SDK does not change JS evaluation, Promise semantics, string interpolation, filesystem APIs or the host's process globals.

A standalone library maintains browser/compiler isolation and reusable types. Reject embedding shell operations into the compiler, magical thenable command objects, unbounded automatic capture and a new general-purpose filesystem/glob/task framework in MVP. Files, paths, temporary directories and argument parsing use native Node or existing libraries until a focused proposal establishes a useful addition.

## Validation and completion

- Real executable fixtures using `process.execPath`: zero/nonzero exits, signal exits, missing/not-executable commands, invalid argv/options, Unicode/empty/space/quote/metacharacter/newline arguments and working-directory errors. Verify argv boundaries without a shell.
- Environment snapshot/replace/removal, concurrent different cwd/env runs, no parent global mutation, command reuse and caller-array mutation. Test Windows key handling and executable search explicitly.
- No-input/inherited input, stdin write/early close, binary/invalid UTF-8, exact byte limit/overflow, high-volume stdout and stderr concurrently, inherited/discarded output and bounded memory. Capture types must match policies.
- Already-aborted and mid-run cancellation, timeout, close/error races, graceful/forced teardown, failure during launch and output collection. Prove the owned child is closed, timers/listeners released, and primary/secondary errors preserved. Do not use mocked spawn tests as the only ownership evidence.
- Native TypeScript type/negative tests, actual mixed JS/TS/Twill execution and original-script source-map diagnostics, formatter/idempotence and linter on examples, declarations/export and independent installed package consumers. Existing grammar/editor behavior remains unchanged unless scripts expose a real gap.
- Real Linux/macOS/Windows process tests before claiming cross-platform support; POSIX-specific signals and shell behavior have explicit boundaries. Later scoped/pipeline/shell work has separate lifecycle, backpressure, partial-failure and quoting tests.
- Reproducible native performance/memory comparison, then synchronized public guides, skill/version boundaries and release artifacts. Design acceptance, implementation, merge and publication remain separate decisions.

## Open questions and decision history

The argv-backed first stage and checked-exit default were accepted for implementation in PR #20. The execution core is a native OS-process coordinator rather than a compiler lowering: no command-to-TS conversion, per-command compilation or compiler production dependency. JS/TS declarations describe its API. A different native backend requires measured benefits that justify its maintenance/portability cost. The executable-script amendment was subsequently accepted for the same PR: a standard `#!/usr/bin/env twill` entry and literal-argv CLI dispatch. Interactive execution, pipelines and explicit shells remain separately reviewable milestones. Implementation, merge and publication stay distinct; the accepted SDK and runner ship in 0.2.0.
