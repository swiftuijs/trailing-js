# Testing and coverage

Tests live in the workspace that owns the behavior. Build shared packages before running tests that import public package exports.

```sh
pnpm check
pnpm test:coverage
pnpm test:browser
pnpm editor:coverage
pnpm editor:test
```

Install Playwright Chromium before browser tests. On headless Linux, prefix editor commands with `xvfb-run -a`. Use `TWILL_TEST_VSCODE_PATH` for an existing executable or `TWILL_TEST_VSCODE_VERSION` to select a download. Package the editor with `pnpm editor:package` before testing it.

## Coverage gates

Vitest uses V8 coverage remapped to source ASTs. Reports include statements, branches, functions and lines. Every public package has a gate; the compiler and parser have additional file gates. Build adapter entry points are included rather than excluded from the compiler report.

| Scope                                    | Statements | Branches | Functions | Lines |
| ---------------------------------------- | ---------: | -------: | --------: | ----: |
| Core package                             |        98% |      95% |       99% |   99% |
| Compiler                                 |       100% |      98% |      100% |  100% |
| Parser                                   |        98% |      97% |      100% |  100% |
| TypeScript server bridge                 |        98% |      93% |      100% |  100% |
| Formatter                                |        98% |      97% |      100% |  100% |
| Linter                                   |       100% |      98% |      100% |  100% |
| Browser highlighter                      |       100% |     100% |      100% |  100% |
| Shell SDK                                |        98% |      95% |      100% |   99% |
| Source export                            |        99% |      96% |      100% |  100% |
| Playground scheduler and compiler worker |       100% |     100% |      100% |  100% |
| Packaged VS Code extension               |        98% |      95% |      100% |   98% |

Editor coverage comes from the real extension host running the extracted VSIX, with c8 collecting V8 ranges. The collector checks that the packaged bundle matches the build before supplying its development source map; the bundle remains unchanged. A separate check rejects empty or incomplete reports. c8's line-based statement/range metrics differ from Vitest's AST metrics, so do not combine their percentages or call an empty function denominator 100% coverage.

Provider boundary tests capture registrations from the same cached, shipped extension module and call them with real VS Code documents, language services, cancellation tokens and workspace edits. Controlled request-version changes exercise stale-result rejection; scoped API interception is restored after activation. Inferred-project fixtures live outside the repository so they cannot inherit a package's tsconfig. Native backend faults, such as skipped declaration emit and missing programs, are injected at the TypeScript API boundary without adding test hooks to production code.

Playground control-flow coverage covers its scheduler and worker, including bounded input, stale responses, retries, failures and cancellation on disposal. Vue rendering, CodeMirror editing, accessibility and responsive behavior are validated by Chromium integration tests rather than included in that unit percentage. Third-party engines, Electron and VS Code's own implementation are outside Twill's source coverage.

JSON summaries and HTML reports are generated under each workspace's `coverage/`. Code verification runs the main Linux job: build, typecheck, unit coverage, grammar tests, examples, lint/format, output budgets, seven independent package installations, packaged stable VS Code coverage and browser integration tests. Coverage replaces the ordinary unit run rather than repeating it. Public package consumers run on Node 20 after building with Node 22. Reports and validated distributions are uploaded separately.

Ordinary PRs select jobs using the complete base-to-head diff, including deletions and both sides of renames. Documentation/site/skill and retained-report changes use documentation build/type/coverage/skill/format checks plus real browsers at root and `/twill/`; they do not rebuild Rust or run unrelated packaged-editor/consumer tests. Compiler/runner/export/runtime changes retain the full Linux verification (including both shell adapters) and Windows/macOS runner/subprocess jobs. Native backend/shared shell contracts/dependency/build changes require all eight real OS/CPU/libc jobs and complete native assembly. Unclassified files or unavailable diff history select all checks. Main, weekly, manual and release runs always select all checks.

`node --test packages/shell-native/tests/ci-scope.test.mjs` checks routing before every CI run, including actual Git history/CLI outputs, mixed changes, renamed native files, unavailable bases and full release events. Failure of this job fails the stable required `verify` check. Cargo dependency/target caches and Linux BuildKit layers are separated by CPU/libc/toolchain/build inputs; cache hits do not bypass real-process tests, coverage, independent consumers, fingerprints or byte gates. A first run populates caches; cache eviction is a build-time cost, not a validation failure.

`Extended validation` is manual: enable `compatibility` for Windows/macOS and Node 24 checks plus the minimum VS Code host, or enable `benchmarks` to collect timing reports. Run compatibility checks before release and after changes to paths, file resolution, CLI processes, Node APIs or editor support. A release reuses the regular verification workflow, also checks the minimum editor host, and publishes its exact tested artifacts. Deterministic size budgets and behavioral comparisons remain required on every change; noisy timing measurements are not a merge gate.

## What the tests exercise

- Parser and compiler: native TypeScript corpus, JS/JSX variants, malformed source, lexical keyword collisions, Unicode identifiers, private members, nested callbacks, contextual member shorthand, hygienic names, source maps and all JS line endings.
- Semantics: native-JavaScript differential execution, guard narrowing and exits, cleanup ordering and failures, hoisted declarations and JSDoc, asynchronous cleanup, switch exhaustiveness, native React/Vue rendering and component identity.
- Hosts: actual Vite, Rollup, esbuild, webpack and Rspack builds; mixed native/dialect imports; Node loader resolution, host error forwarding, inherited JSX settings and original-source debugging.
- Editor: partial and unsaved inputs, source-safe edits, auto-imports, references, cross-file rename, definitions, signatures, formatting, configuration reloads and native TS-server consumers. Highlighting uses real TS/TSX grammars in both unit tests and packaged extension hosts, including strings, comments, regexps, templates and JSX nesting.
- Executable runner: actual direct/explicit invocation and POSIX shebangs, literal arguments including CLI flags, standard argv/I/O/cwd/environment, script-local dependencies/configuration, extensionless entries and native imports, original error positions, native exit codes/signals and independent installed binaries. Persistent runner caches cover miss/hit, same-timestamp content changes, configuration probes/inheritance, source maps, corruption, collisions/bounds, private-directory/file rules, concurrent atomic writes and optional I/O failure fallback.
- Shell SDK: literal argv, NUL/invalid options, immutable values, concurrent cwd/environment isolation, binary and multi-byte input/output, byte overflow, both output pipes, exit/signal/launch/write/read failures, cancellation races, graceful/forced teardown, unresolved PID reporting, descriptor-owning descendants, actual Twill scripts/defer cleanup, declarations and native exported execution. Native backend faults are injected at Node API boundaries only; real children are joined/cleaned.
- Tooling: formatter idempotence and compiled AST preservation, type-aware linting with cache refresh/eviction, withheld unsafe fixes, declarations, export preflight, imported assets and rollback on disk failure.
- Framework pilot: pinned React core source integrity, compilation, formatted AST preservation, dev/prod APIs and lazy/transition/act behavior; native/dialect ReactDOM rendering and output budgets. This is not the full upstream React test suite.
- Web highlighting: shared TextMate JSON, real Shiki scopes, standalone/custom-theme rendering, public types on Shiki 2.5/3/4, engine-free grammar import and actual browser WASM loading.
- Browser: highlighted live compilation, draft storage, keyboard editing, input bounds, read-only output, downloads, retry, stale-result handling and desktop/mobile navigation.

A gate measures executed source, not correctness of every input. Remaining uncovered branches include host fallbacks, conservative edit rejection and some platform-specific paths. Add tests around observable contracts and actual regressions; do not lower gates, exclude production code, add coverage-ignore directives or manufacture assertions to make a report green.

## Performance checks

```sh
pnpm benchmark --output compiler-results.json
pnpm benchmark:project --output project-results.json
pnpm benchmark:branching --output branching-results.json
pnpm benchmark:shell --output ../../shell-results.json --verify-performance
taskset -c 0 node packages/shell-native/benchmarks/benchmark.mjs --concurrency-cpus 0-3 --output packages/shell-native/benchmarks/target/production.json --verify-performance
node packages/twill/benchmarks/runner.mjs > runner-results.json
node packages/twill/benchmarks/script-startup.mjs > script-startup-results.json
node packages/twill/benchmarks/startup-profile.mjs > startup-profile-results.json
pnpm --filter @swiftuijs/twill test:size --output ../../bundle-results.json
```

The isolated Linux [Rust subprocess experiment](../../packages/shell/experiments/rust-native/README.md) has its own pinned native build, real child-process/addon tests and paired benchmark. It is excluded from published SDK files. Its CI job repeats tests on Node 22 and Node 20.19.0; benchmark reports preserve sequential wall/parent CPU, isolated RSS, source startup and default/expanded-pool concurrency separately. It does not replace the SDK's cross-platform contract suite or authorize a production backend.

Compiler benchmarks include implicit member callbacks and check minified-code identity against native arrows. Project benchmarks include partial-member completion, warm/changed hover, checking and formatting. Size checks enforce deterministic bundle/artifact budgets and native behavior parity. Reports retain environment/workload information; absolute timing thresholds would be unreliable across CI machines. Measure representative application hot paths before making a performance claim. Keep worker input/retry limits and cache bounds covered as functional contracts.

The production-contract native workspace runs the same real-process contract factory as the Node SDK, plus raw N-API validation, JS-boundary failure handling, input/environment/cwd snapshots, mixed Node/native completion, worker/process-exit cleanup, descendant-held pipes and host-pool availability. V8 coverage measures the JS adapter, not Rust branch coverage. `test:native` enforces rustfmt/clippy; actual platform tests exercise the compiled native coordinator. All eight OS/CPU/libc targets require independent installed-package lifecycle tests on Node 20.19 without Rust/compiler installation. Release assembly validates every tested binary and the separate native archive budget.

Run native performance measurements without concurrent builds/tests, with all backend builds complete and the measured checkout clean. Choose allowed workload CPUs appropriate to the host quota; the reviewed run pins sequential work to one CPU and concurrency to four. The native gate retains eleven paired warm samples and 48 default-pool concurrency pairs, both operation orders, unchanged 1.10× median/upper-confidence bounds and every failed review. PID-marker fixtures must publish atomically and cleanup must reject nonpositive identifiers. Raw reports and any exact continuation script/source hashes belong in `packages/shell-native/benchmarks/results`; do not replace completed samples when finishing an interrupted run. Timing acceptance, real-platform correctness and publication are separate checks.

Linux prebuilds are built/tested on native x64 and ARM64 runners inside Rocky Linux 8 (glibc 2.28) or Alpine (musl 1.2.5) containers. Musl consumers repeat installation on Alpine/Node 20.19. Windows ARM64 must build and run with ARM64 Node and the matching MSVC target; architecture emulation alone is not validation. `tests/pidfd.test.ts` compiles a Linux syscall-filter launcher to exercise actual missing/denied pidfds, success, concurrent completion, cancellation, timeout and notification-resource failures without changing SIGCHLD handlers. Keep the fast-path timing report separate from polling-fallback costs. Cross-compilation or a successful link is insufficient to mark a platform supported.
