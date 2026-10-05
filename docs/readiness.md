# Support and limitations

Twill is an experimental JS/TS dialect. Its compiler, editor and build integrations support a complete development workflow, with the boundaries below. Evaluate it against your application's syntax, dependencies and deployment environment before adopting it.

## Language and ecosystem

Trailing callbacks, `guard` and `defer` work in ordinary code. `.twillx` also supports native JSX component children, render props and lazy Vue slots. Component libraries use their normal framework APIs; the compiler does not require component registration or wrappers.

Native TS/JS and Twill can import each other through the build adapters, virtual project checker and Node ESM loader. Source maps support original-source diagnostics and debugging. Libraries can emit standard declarations with `twill declarations`; native `tsc` cannot parse Twill source directly.

The [syntax reference](syntax.md) defines supported syntax and ambiguity rules. Twill uses TypeScript's type system, but parser coverage is not identical to every TypeScript release. Unsupported constructs report diagnostics. A CommonJS Twill loader, Vue SFC compilation and arbitrary SSR framework integration are outside the supported host workflows.

## Editor assistance

The VS Code extension supplies diagnostics, completion, hover, signatures, definitions, references, automatic imports, cross-file rename, import organization, formatting and safe quick fixes. Its TS-server bridge supports native TS/JS consumers of Twill files and synchronizes unsaved dialect documents.

React props and callback parameters use project types. Vue slot inference has the limits of Vue's JSX declarations and can require annotations. Incomplete source receives assistance where it can be repaired safely; arbitrarily malformed input can suspend semantic suggestions. Edits that cannot map exactly to original source tokens are withheld. General refactoring and fix-all are unavailable.

The virtual checker uses TypeScript 5.9. Compatibility with arbitrary workspace TypeScript versions is not guaranteed.

## Runtime and tooling performance

Ordinary trailing closures and guards lower to arrows and branches without a runtime library. `defer` and general child collection allocate local closures or arrays. Use native `try/finally` when those allocations matter in a hot path.

The checker caches unchanged snapshots and transforms. Disk edits refresh affected files; configuration changes rebuild affected projects. [Performance measurements](performance.md) describe synthetic compiler, checker and formatter workloads, including their limits. They do not establish whole-application latency or a universal performance guarantee.

Representative native/dialect application bundles are checked for byte and behavior parity. Release tarballs and the VSIX have enforced compressed size budgets. Each VSIX includes one pinned engine shared on disk by both editor hosts and is verified after extraction, without workspace symlinks.

## Adoption and source export

Use one module at a time with the existing project. The optional migration package exports a checked single-project source graph to formatted native TS/TSX in a new directory, rewriting relative dialect imports in both native and dialect files. Source errors, collisions and unsupported paths stop the export; originals remain intact.

This is source export rather than a complete application installer. Dependencies, host build configuration, public assets, project references and computed dynamic module paths have separate boundaries. See [adoption and migration](adoption.md) for the exact workflow. Real project pilots are needed to establish team productivity and dependency-heavy project performance.

## Tested tool versions

| Tool                         | Tested contract                                                  |
| ---------------------------- | ---------------------------------------------------------------- |
| Compiler consumers           | Node 20.19+ or 22.12+                                            |
| Repository development       | Node 22.13+ or 24+, pnpm 11.19                                   |
| Checker and editor semantics | TypeScript 5.9                                                   |
| React development adapter    | Vite 8, React plugin 6, automatic JSX runtime; React 18/19 peers |
| Formatter                    | Prettier 3.9                                                     |
| Linter                       | ESLint 9/10 flat configuration                                   |
| VS Code                      | Minimum 1.95.3 and current stable                                |
| Documentation                | VitePress 1.6; Chromium desktop and mobile viewport tests        |

Validation covers execution, type checking, source mappings, actual bundler builds, independently installed tarballs and real VS Code extension hosts. CI runs on Linux, Windows and macOS. The grammar corpus exercises TypeScript constructs with closures, while seeded differential tests compare combined callbacks, guards and cleanup against handwritten JavaScript. These checks cover the documented workflows; they do not prove every application or language construct works.

## Distribution

The compiler, formatter, linter and optional source migration tool are public package targets. The repository root, examples and documentation are private workspaces. Reviewed tarballs and VSIX artifacts can be built from the repository; npm and Marketplace publication are separate maintainer operations. See [getting started](getting-started.md) for installation and [releasing](releasing.md) for artifact verification.
