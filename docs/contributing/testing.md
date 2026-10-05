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
| Source export                            |        99% |      96% |      100% |  100% |
| Playground scheduler and compiler worker |       100% |     100% |      100% |  100% |
| Packaged VS Code extension               |        98% |      95% |      100% |   98% |

Editor coverage comes from the real extension host running the extracted VSIX, with c8 collecting V8 ranges. The collector checks that the packaged bundle matches the build before supplying its development source map; the bundle remains unchanged. A separate check rejects empty or incomplete reports. c8's line-based statement/range metrics differ from Vitest's AST metrics, so do not combine their percentages or call an empty function denominator 100% coverage.

Provider boundary tests capture registrations from the same cached, shipped extension module and call them with real VS Code documents, language services, cancellation tokens and workspace edits. Controlled request-version changes exercise stale-result rejection; scoped API interception is restored after activation. Inferred-project fixtures live outside the repository so they cannot inherit a package's tsconfig. Native backend faults, such as skipped declaration emit and missing programs, are injected at the TypeScript API boundary without adding test hooks to production code.

Playground control-flow coverage covers its scheduler and worker, including bounded input, stale responses, retries, failures and cancellation on disposal. Vue rendering, CodeMirror editing, accessibility and responsive behavior are validated by Chromium integration tests rather than included in that unit percentage. Third-party engines, Electron and VS Code's own implementation are outside Twill's source coverage.

JSON summaries and HTML reports are generated under each workspace's `coverage/`. CI enforces gates and uploads reports, independent package artifacts, size checks and benchmark evidence. Stable VS Code runs coverage; the minimum supported host runs the same functional integration suite. Linux, macOS and Windows run build, checker, unit, example and package checks; public packages also run in an independent Node 20 consumer.

## What the tests exercise

- Parser and compiler: native TypeScript corpus, JS/JSX variants, malformed source, lexical keyword collisions, Unicode identifiers, private members, nested callbacks, contextual member shorthand, hygienic names, source maps and all JS line endings.
- Semantics: native-JavaScript differential execution, guard narrowing and exits, cleanup ordering and failures, hoisted declarations and JSDoc, asynchronous cleanup, switch exhaustiveness, native React/Vue rendering and component identity.
- Hosts: actual Vite, Rollup, esbuild, webpack and Rspack builds; mixed native/dialect imports; Node loader resolution, host error forwarding, inherited JSX settings and original-source debugging.
- Editor: partial and unsaved inputs, source-safe edits, auto-imports, references, cross-file rename, definitions, signatures, formatting, configuration reloads and native TS-server consumers. Highlighting uses real TS/TSX grammars in both unit tests and packaged extension hosts, including strings, comments, regexps, templates and JSX nesting.
- Tooling: formatter idempotence and compiled AST preservation, type-aware linting with cache refresh/eviction, withheld unsafe fixes, declarations, migration preflight, imported assets and rollback on disk failure.
- Browser: highlighted live compilation, draft storage, keyboard editing, input bounds, read-only output, downloads, retry, stale-result handling and desktop/mobile navigation.

A gate measures executed source, not correctness of every input. Remaining uncovered branches include host fallbacks, conservative edit rejection and some platform-specific paths. Add tests around observable contracts and actual regressions; do not lower gates, exclude production code, add coverage-ignore directives or manufacture assertions to make a report green.

## Performance checks

```sh
pnpm benchmark --output compiler-results.json
pnpm benchmark:project --output project-results.json
pnpm benchmark:branching --output branching-results.json
pnpm --filter @swiftuijs/twill test:size --output ../../bundle-results.json
```

Compiler benchmarks include implicit member callbacks and check minified-code identity against native arrows. Project benchmarks include partial-member completion, warm/changed hover, checking and formatting. Size checks enforce deterministic bundle/artifact budgets and native behavior parity. Reports retain environment/workload information; absolute timing thresholds would be unreliable across CI machines. Measure representative application hot paths before making a performance claim. Keep worker input/retry limits and cache bounds covered as functional contracts.
