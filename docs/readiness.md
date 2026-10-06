# Compatibility and limitations

Twill 0.1 is an experimental TypeScript extension language with a tested development workflow. It is ready for a scoped evaluation of the documented compiler, editor and build integrations. A broad production-ready claim would go beyond the current evidence.

## Adoption status

| Area                     | Current evidence                                                                                                            | Remaining gate                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| End-to-end workflow      | Executable compiler checks, mixed TS/JS, real packaged VS Code hosts, formatter/linter and independently installed packages | Validate your application syntax, libraries and failure paths                       |
| Runtime and bundle costs | Native/dialect behavior comparisons, deterministic output budgets and reproducible synthetic benchmarks                     | Dependency-heavy applications, renderer workloads and target engines                |
| Distribution             | Versioned npm package metadata, independently tested tarballs, VSIX artifacts and checksum validation                       | Application validation and a production support track record                        |
| Adoption                 | One-file opt-in, native declarations and checked source export                                                              | Real team pilots demonstrating maintained editor responsiveness and review benefits |

Tests make supported behavior reviewable; they do not establish a production track record. Before a production commitment, choose a reviewed version, verify the host workflow, measure your project and agree how updates and regressions will be handled. See [why Twill](why-twill.md) for benefits and tradeoffs and [gradual adoption](adoption.md) for a pilot path.

## Language and ecosystem

Trailing callbacks, destructured `guard`, `defer` and value/pattern switch expressions work in ordinary code. `.twillx` also supports native JSX component children, render props and lazy Vue slots. Component libraries use their normal framework APIs; the compiler does not require component registration or wrappers.

Native TS/JS and Twill can import each other through the build adapters, virtual project checker and Node ESM loader. Source maps support original-source diagnostics and debugging. Libraries can emit standard declarations with `twill declarations`; native `tsc` cannot parse Twill source directly.

The [syntax reference](syntax.md) defines supported syntax and ambiguity rules. Twill extends TypeScript/TSX and uses TypeScript's type system, but the current release is not a complete TypeScript superset: parser coverage is not identical to every TypeScript release, and trailing closures can change how a call followed by a block is parsed. Unsupported constructs report diagnostics. A CommonJS Twill loader, Vue SFC compilation and arbitrary SSR framework integration are outside the supported host workflows.

## Editor assistance

The VS Code extension supplies diagnostics, completion, hover, signatures, definitions, references, automatic imports, cross-file rename, import organization, formatting and safe quick fixes. Its TS-server bridge supports native TS/JS consumers of Twill files and synchronizes unsaved dialect documents.

React props and callback parameters use project types. Vue slot inference has the limits of Vue's JSX declarations and can require annotations. Incomplete source receives assistance where it can be repaired safely; arbitrarily malformed input can suspend semantic suggestions. Edits that cannot map exactly to original source tokens are withheld. General refactoring and fix-all are unavailable.

The virtual checker uses TypeScript 5.9. Compatibility with arbitrary workspace TypeScript versions is not guaranteed.

## Runtime and tooling performance

Ordinary trailing closures and guards lower to arrows and branches without a runtime library. Direct-return switch expressions lower to scoped native switches; other expression positions use a synchronous IIFE. Await/yield inside a switch requires a direct return. Expression exhaustiveness requires the checker, not transpile-only builds. `defer` and general child collection allocate local closures or arrays. Use native `try/finally` when those allocations matter in a hot path.

The checker caches unchanged snapshots and transforms. Disk edits refresh affected files; configuration changes rebuild affected projects. [Performance measurements](performance.md) describe synthetic compiler, checker and formatter workloads, including their limits. They do not establish whole-application latency or a universal performance guarantee.

A [pinned React core source study](react-source.md) additionally exercises real framework modules, dev/prod contracts and ReactDOM compatibility. It does not cover a complete framework rewrite, upstream test suite or typed team pilot.

Representative native/dialect application bundles are checked for behavior parity and documented byte budgets. Release tarballs and the VSIX have enforced compressed size budgets. Each VSIX includes one pinned engine shared on disk by both editor hosts and is verified after extraction, without workspace symlinks.

## Adoption and source export

Use one module at a time with the existing project. The optional export package exports a checked single-project source graph to formatted native TS/TSX in a new directory, rewriting relative dialect imports in both native and dialect files. Source errors, collisions and unsupported paths stop the export; originals remain intact.

This is source export rather than a complete application installer. Dependencies, host build configuration, public assets, project references and computed dynamic module paths have separate boundaries. See [gradual adoption and source export](adoption.md) for the exact workflow. Real project pilots are needed to establish team productivity and dependency-heavy project performance.

## Tested tool versions

| Tool                         | Tested contract                                                  |
| ---------------------------- | ---------------------------------------------------------------- |
| Compiler consumers           | Node 20.19+ or 22.12+                                            |
| Checker and editor semantics | TypeScript 5.9                                                   |
| React development adapter    | Vite 8, React plugin 6, automatic JSX runtime; React 18/19 peers |
| Formatter                    | Prettier 3.9                                                     |
| Linter                       | ESLint 9/10 flat configuration                                   |
| VS Code                      | Minimum 1.95.3 and current stable                                |

Validation covers execution, type checking, source mappings, actual bundler builds, independently installed tarballs and real VS Code extension hosts. CI enforces statement, branch, function and line coverage gates, including 100% line/function coverage for the compiler and parser. Highlighting checks use real TS/TSX grammars, and the packaged editor is tested for completion, navigation, source-safe edits and debugging. Coverage does not prove correctness for every input. Every change is validated on Linux, including packaged editor and browser tests. Windows, macOS and Node 24 compatibility checks are available through a manual validation workflow; the minimum supported VS Code host is also checked for releases. The grammar corpus exercises TypeScript constructs with closures, while seeded differential tests compare combined callbacks, guards and cleanup against handwritten JavaScript. These checks cover the documented workflows; they do not prove every application or language construct works.

## Distribution

Install compiler and optional tooling packages by name using your normal package manager; keep Twill packages on the same version and commit your lockfile. See [getting started](getting-started.md) and the [editor setup](tooling.md#set-up-vs-code).

The 0.x release line is experimental. Language semantics and integration contracts may change between minor versions; patch versions are intended for compatible fixes. Read the [changelog](https://github.com/swiftuijs/twill/blob/main/CHANGELOG.md) and rerun your checks before upgrading. There is no LTS or commercial support commitment.

Report reproducible compiler or tooling problems through [GitHub Issues](https://github.com/swiftuijs/twill/issues). Include the package versions, host versions, relevant configuration and a minimal source example. `twill doctor --json` can help identify the project configuration; review its filenames and diagnostic text before sharing.

Install the editor extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=forth-ink.twill). See [GitHub Releases](https://github.com/swiftuijs/twill/releases) for version announcements and offline VSIX downloads.
