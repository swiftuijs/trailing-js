# Readiness and remaining work

Twill 0.5 has production-oriented tooling, but the language is experimental. It is suitable for evaluated, controlled adoption where the team can use the documented syntax subset and retain a path to standard TS/JS. It is not yet a mature default toolchain for arbitrary production applications or published libraries.

## What is supported

- General JS/TS code, trailing callbacks, guards and block-scoped cleanup, independently of React or Vue.
- Two-way local imports with native TS/JS, ESM live bindings, source maps and a virtual whole-project checker.
- Real build integrations for Vite, esbuild, Rollup, webpack and rspack, plus an opt-in Node ESM loader.
- Native JSX component semantics, React children/render props and lazy Vue slots. `@swiftuijs/ui` is an example, not a special compiler target.
- VSIX diagnostics, hover, member completion, signature help and definitions. Native TS/JS consumers in configured mixed projects receive a TS-server bridge, including unsaved-source synchronization.

The 0.5 implementation passed 87 tests and real package/VSIX probes, with successful Linux, Windows and macOS CI. Framework checks include rendering and native JSX type inference. These are correctness and packaging evidence, not proof of complete TypeScript grammar coverage or production application reliability. The extracted VSIX's TS-server plugin is tested; automated typing through a real VS Code extension host remains to be added.

## Editor boundaries

Twill transforms source into virtual TS/TSX, asks a TypeScript 5.9 language service for information, and maps positions back. Project dependencies supply framework types. Native JS retains ordinary JS/JSDoc checking; `.twill` is based on TypeScript, so its implicit-parameter rules follow TS settings.

React props and callback parameters use native JSX types. Probes confirm prop suggestions in an empty `Card({  })` object, contextual callback hover, and member suggestions in an incomplete callback. However, a partially written shorthand prop such as `Card({ tit })` currently maps into the generated value expression and fails to suggest `title`. Arbitrarily malformed input can also suspend semantic assistance. Vue scoped-slot inference has the limits of Vue's native JSX declarations and can require explicit annotations.

Automatic imports, import organization, cross-dialect rename/refactoring, code fixes and formatting are not implemented for Twill documents. Native TS/JS features outside the bridge retain their existing providers; this does not make edits into Twill sources safe. Workspace TypeScript versions are not yet a verified compatibility matrix: the virtual checker uses Twill's TypeScript 5.9 tooling.

## Performance boundaries

See [the measurements and methodology](performance.md). Ordinary closures and guards lower to ordinary arrows and branches without runtime helpers; equivalent handwritten output is checked. Single-expression React children are direct JSX values. General child collection and `defer` perform additional allocation and work.

The current synthetic 1,000-callback, 61.9 KB file takes a median 126.36 ms for syntax lowering and 210.60 ms through the TS plugin pipeline. A 69.9 KB fixture with 1,000 nested UI views takes 294.94 ms through the UI plugin pipeline. These stages exclude process startup, project type checking, filesystem work, bundler optimization, rendering and editor UI latency. They are not whole-application performance numbers.

Synchronous cleanup hot-loop measurements show roughly 4.8–21.9 times the work of the compared allocation-free native `finally` loop, depending on registration count. This is a specific microbenchmark, not an application slowdown ratio. Real I/O cleanup, async cleanup, different engines and large application workloads remain to be measured.

Unchanged editor snapshots and mapping results are cached. The VSIX currently disposes all cached projects after any watched source/JSON disk change and schedules diagnostics for all open Twill documents after document changes. These broad invalidations need improvement and measurement before large-workspace responsiveness can be promised. The native TS-server bridge adds another language service; its memory cost needs evaluation as well.

## Priorities before a stable production claim

| Priority | Work                                                                                                                                              | Evidence needed                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | Complete daily editor workflows: partial props, auto-import edits, rename, import organization, code fixes; provide formatter/linter integration. | Real VS Code extension-host tests of typing, unsaved mixed files, edits and navigation.                                                                      |
| 1        | Define and stabilize the supported TS/JS grammar and semantics; strengthen parser conformance, negative cases and fuzzing.                        | Compatibility fixtures against supported TypeScript versions and mapped, actionable failures for unsupported syntax.                                         |
| 1        | Exercise substantial React, Vue and non-UI applications; improve per-file editor invalidation and incremental build behavior.                     | Cold/warm builds, HMR, type checking, editor p50/p95 latency and peak memory at representative project sizes; React Fast Refresh integration where expected. |
| 2        | Add a library distribution pipeline, declaration emission and project-reference/build-mode support.                                               | Installed consumers using emitted declarations without depending on dialect-aware editors or native `tsc` parsing Twill.                                     |
| 2        | Stabilize releases, version/support policy and public installation.                                                                               | Reproducible release gates and documented npm/Marketplace installation and upgrades. Packaging currently works locally; publishing is separate work.         |
| 3        | Expand editor/ecosystem integration and pursue official GitHub recognition when adoption qualifies.                                               | Maintained grammars, supported integrations and upstream acceptance; see [GitHub integration](github.md).                                                    |

Do not add more syntax simply to reach a feature count. The next step toward stability is closing these workflow and validation gaps around the existing language.
