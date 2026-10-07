# RFC 0034: Swift-inspired shell scripting toolkit

**Status:** Proposed; no implementation or published package.
**Kind:** Tooling / optional Node SDK.
**Release:** Not released.
**Dependencies:** RFC 0026 for executing Twill sources; RFCs 0002, 0007 and 0009 supply optional application syntax. No dependency on proposed typed throws, argument labels or structured-concurrency syntax.

## Problem and native baseline

Twill already runs scripts using its published Node ESM loader:

```sh
node --enable-source-maps --import @swiftuijs/twill/register scripts/build.twill
```

Top-level await, Node modules, process arguments and native promises remain normal JS/TS. The compiler's CLI currently compiles/checks/exports; it has no `twill run` command. This proposal adds a reusable process toolkit, not a requirement to run a script.

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

## Design (proposed APIs)

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

All SDK examples in this RFC are proposals. Command construction does not spawn, execute callbacks or schedule work. `Command.name` uses the platform's normal executable search; `Command.path` requires an explicit executable path. Arguments are strings, in order, and are passed to `spawn` with `shell: false`. Reject invalid argument/options values and NUL characters before launch; do not coerce arbitrary objects into command text.

Treat a command as a reusable, readonly SDK value: snapshot the argv array once on construction, without claiming deep value semantics for JS objects. Each run creates a distinct child. `cwd` belongs to that child. Never call global `process.chdir`, modify `process.env`, patch prototypes or inject global `$` names.

`Environment.inherit(updates)` takes the parent's current environment at launch, applies a snapshot of updates, and permits explicit key removal with `undefined`. `Environment.replace(values)` uses only the supplied values; it may intentionally remove PATH. Handle Windows case-insensitive environment keys consistently. Options and argument expressions evaluate once, left to right, with ordinary JS rules; property getters keep their native behavior.

### Output, status and errors

MVP input defaults to no input. Output and error default to inherited terminal streams, avoiding buffering/copies. Explicit input can inherit stdin or supply a string/byte buffer; write respecting backpressure, finish stdin, and account for write errors. Capture is opt-in: `Output.text({ limit })` decodes UTF-8 once after successful close; `Output.bytes({ limit })` returns bytes; `Output.discard()` drains without retaining output. A finite positive byte limit is required for capture. Exceeding it rejects with an output-limit error after child cleanup, without silently truncating output. Text decoding follows Node's normal replacement of invalid UTF-8. Streaming belongs to a later scoped API.

Return a typed result with `processIdentifier`, `terminationStatus`, `standardOutput` and `standardError`. Capture policy determines the corresponding output type (`string`, bytes or `undefined`). Status uses an ordinary TypeScript discriminated union:

```ts
type TerminationStatus =
  { kind: 'exited'; code: number } | { kind: 'signaled'; signal: NodeJS.Signals };
```

`check` defaults to true for build-script ergonomics: a nonzero exit or signal rejects with a `ProcessExitError` carrying the status and bounded captured output. `check: false` returns that status as data. This differs deliberately from Swift's status-first default. A launch/I/O failure, abort, timeout or output-limit failure always rejects regardless of `check`; it is not a fabricated numeric exit status. Use native try/catch and TypeScript error guards, not an unimplemented Swift `throws` contract. Logs must not automatically include command arguments, environment values or captured output; callers can choose what to print.

Promise completion occurs after the child closes and owned I/O finishes. A single completion coordinator settles exactly once when error/exit/close/abort events race, removes listeners/timers, and retains the primary cause; cleanup failures are attached as structured secondary errors rather than replacing it. Validate timeout/grace durations. On an already-aborted signal, launch nothing. Running abort/timeout initiates graceful termination followed by forced termination after the configured grace period, then waits for close. Use Node-supported behavior per platform and test it.

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

The first implementation should provide the SDK's argv-backed `run`, bounded capture, status/error types, environment/cwd isolation and cancellation. Validate an actual `.twill` script through the existing loader, plus native JS/TS consumers. Document Node versions based on the tested SDK manifest; the compiler's Node support does not automatically validate this SDK.

Keep the existing Node invocation as the initial entry point. A future `twill run`/dedicated runner needs its own tooling amendment specifying argv forwarding, cwd, nearest project/package resolution, config selection, source maps, error/exit codes and Node/Windows behavior. Do not introduce a second compiler or transpile once per command. Shebangs are optional POSIX packaging conveniences, not a Windows support contract. No watch/server daemon or global installation is required.

The SDK is a production dependency when distributed JS imports it. Source-only scripts also need the Twill compiler/loader available when invoked. Native-source export retains the ordinary SDK import and produces normal JS/types; do not bundle SDK internals or pretend this is a compiler-generated runtime dependency.

After implementation, update the package README, public scripting/build guide, official application skill, changelog, examples, package/export validation and site navigation where useful. Until then, do not advertise the proposed imports as installable. A source prototype and a published version must be distinguished.

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

Proposed in response to shell scripting/toolkit use cases. Recommend accepting the argv-backed MVP first; interactive execution, pipelines, explicit shells and a runner remain separately reviewable milestones. Confirm the final public naming and the default checked-exit policy at acceptance. No new language syntax or SDK implementation is approved or shipped by this RFC alone.
