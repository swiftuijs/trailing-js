# Readiness and remaining work

Twill 0.6 has production-oriented tooling, but the language is experimental. It is suitable for evaluated, controlled adoption where the team can use the documented syntax subset and retain a path to standard TS/JS. It is not yet a mature default toolchain for arbitrary production applications or published libraries.

## What is supported

- General JS/TS code, trailing callbacks, guards and block-scoped cleanup, independently of React or Vue.
- Two-way local imports with native TS/JS, ESM live bindings, source maps and a virtual whole-project checker.
- Real build integrations for Vite, esbuild, Rollup, webpack and rspack, plus an opt-in Node ESM loader.
- Native JSX component semantics, React children/render props and lazy Vue slots. `@swiftuijs/ui` is an example, not a special compiler target.
- VSIX diagnostics, hover, contextual completion (including partial React props), signature help, definitions, automatic imports, mixed-file rename, import organization and safe quick fixes. Native TS/JS consumers receive a TS-server bridge and unsaved-source synchronization.
- pnpm workspaces with Vite/Rolldown builds, independent npm consumer checks, project diagnostics reports and original-source Node debugging.

Validation includes execution/type/mapping tests, real bundler builds, independently installed package and extracted-VSIX TS-server probes, plus real VS Code extension-host tests. The host tests apply completion/import/rename/quick-fix edits to unsaved mixed files and verify Node stack frames and source breakpoints. CI runs Linux, Windows, macOS and Node 20 consumer checks, with minimum and stable VS Code editor jobs. These are correctness and packaging evidence, not proof of complete TypeScript grammar coverage or production application reliability.

## Editor boundaries

Twill transforms source into virtual TS/TSX, asks a TypeScript 5.9 language service for information, and maps positions back. Project dependencies supply framework types. Native JS retains ordinary JS/JSDoc checking; `.twill` is based on TypeScript, so its implicit-parameter rules follow TS settings.

React props and callback parameters use native JSX types. Empty and partially typed shorthand props such as `Card({ tit })` suggest the prop contract; selecting `title` inserts a value snippet in the original object. Incomplete callback expressions retain contextual member suggestions. Vue scoped-slot inference has the limits of Vue's native JSX declarations and can require explicit annotations. Arbitrarily malformed input can still suspend semantic assistance.

Automatic imports, import organization, cross-dialect rename and mapped quick fixes are implemented. Rename preserves shorthand prop key/value semantics and avoids compiler-generated references. Changes must map exactly to source tokens; unsupported edits are withheld. Formatting, lint integration, general refactoring and fix-all remain missing. Workspace TypeScript versions are not yet a verified compatibility matrix: the virtual checker uses Twill's TypeScript 5.9 tooling.

## Performance boundaries

See [the measurements and methodology](performance.md). Ordinary closures and guards lower to ordinary arrows and branches without runtime helpers; equivalent handwritten output is checked. Single-expression React children are direct JSX values. General child collection and `defer` perform additional allocation and work.

The recorded 0.6 synthetic 1,000-callback, 61.9 KB file takes a median 139.58 ms for syntax lowering and 206.56 ms through the TS plugin pipeline. A 69.9 KB fixture with 1,000 nested UI views takes 323.65 ms through the UI plugin pipeline. These stages exclude process startup, project type checking, filesystem work, bundler optimization, rendering and editor UI latency. They are not whole-application performance numbers.

Synchronous cleanup hot-loop measurements show roughly 4.7–21.6 times the work of the compared allocation-free native `finally` loop, depending on registration count. This is a specific microbenchmark, not an application slowdown ratio. Real I/O cleanup, async cleanup, different engines and large application workloads remain to be measured.

Unchanged editor snapshots and mapping results are cached. Disk changes now refresh individual files while retaining unrelated transforms and unsaved overlays; create/delete rediscovers roots, and relevant configuration changes rebuild affected projects. Diagnostics are scheduled within affected roots. Large-workspace responsiveness still needs measurement before it can be promised. The native TS-server bridge adds another language service; its memory cost needs evaluation as well.

## Priorities before a stable production claim

| Priority | Work                                                                                                                                              | Evidence needed                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | Add formatter/linter integration and broaden safe refactoring and incomplete-input support; retain regression gates for implemented editor edits. | Extend existing real extension-host tests to the new workflows, malformed-input recovery and larger mixed workspaces.                                        |
| 1        | Define and stabilize the supported TS/JS grammar and semantics; strengthen parser conformance, negative cases and fuzzing.                        | Compatibility fixtures against supported TypeScript versions and mapped, actionable failures for unsupported syntax.                                         |
| 1        | Exercise substantial React, Vue and non-UI applications; measure incremental editor/build behavior at realistic workspace sizes.                  | Cold/warm builds, HMR, type checking, editor p50/p95 latency and peak memory at representative project sizes; React Fast Refresh integration where expected. |
| 2        | Add a library distribution pipeline, declaration emission and project-reference/build-mode support.                                               | Installed consumers using emitted declarations without depending on dialect-aware editors or native `tsc` parsing Twill.                                     |
| 2        | Stabilize releases, version/support policy and public installation.                                                                               | Reproducible release gates and documented npm/Marketplace installation and upgrades. Packaging currently works locally; publishing is separate work.         |
| 3        | Expand editor/ecosystem integration and pursue official GitHub recognition when adoption qualifies.                                               | Maintained grammars, supported integrations and upstream acceptance; see [GitHub integration](github.md).                                                    |

Do not add more syntax simply to reach a feature count. The next step toward stability is closing these workflow and validation gaps around the existing language.
