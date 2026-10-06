# Repository development

Use Node 22.13+ and the pnpm version pinned in the root `packageManager`. `corepack enable` enables pnpm where Corepack is available; otherwise install that pnpm version separately. The distributed compiler also supports Node 20.19+; the repository build/test tools require Node 22+.

## Layout

| Workspace                         | Role                                                                                                 | Build                                                                                                           |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `packages/twill`                  | Public `@swiftuijs/twill`: compiler, CLI, checker, Node loader, shared editor API and build adapters | Vite library mode emits ESM and the CJS TS-server entry; `vite-plugin-dts` emits tool API declarations          |
| `packages/formatter`              | Public `@swiftuijs/twill-formatter`: Prettier plugin                                                 | Vite library mode and API declarations                                                                          |
| `packages/linter`                 | Public `@swiftuijs/twill-linter`: ESLint processor and recommended configs                           | Vite library mode and API declarations                                                                          |
| `packages/highlight`              | Public `@swiftuijs/twill-highlight`: browser/SSR Shiki integration and shared TextMate grammars      | Vite library mode and API declarations                                                                          |
| `packages/export`                 | Optional public `@swiftuijs/twill-export`: checked source export to native TS/TSX                    | Vite library mode, CLI and API declarations                                                                     |
| `examples/*`                      | Eight private applications/libraries, each with its own manifest                                     | Local Vite configurations; library adds declaration emission                                                    |
| `editors/vscode`                  | VS Code extension and TextMate grammars                                                              | Vite bundles a standalone CJS extension; preparation copies standard-library declarations, schemas and licenses |
| `editors/twill-typescript-plugin` | Private `@swiftuijs/twill-vscode-tsserver` bridge bundled in the VSIX                                | Vite bundles a CJS TS-server plugin                                                                             |
| `apps/docs`                       | Private VitePress site, English reference, local search and compiler worker playground               | VitePress static site; shared `docs/` references                                                                |
| Root                              | Workspace coordination, shared configuration and release gates                                       | Private pnpm workspace coordinator; not a published package                                                     |

Workspace dependencies order builds and use public compiler exports. Vite 8 uses Rolldown for repository bundles; there is no separate tsup/esbuild build pipeline. esbuild remains a supported consumer adapter and is used in adapter/native-output tests. Examples exercise ordinary functions, cleanup, mixed TS/JS, React and Vue. No compiler special case exists for `@swiftuijs/ui`.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm build                # all workspace bundles and compiler declarations
pnpm check                # build, typecheck, tests, consumer checks, packaged VSIX probes
pnpm format:check
pnpm test:coverage
pnpm editor:coverage     # source coverage from the shipped VSIX in a real host
pnpm package:core         # swiftuijs-twill-0.9.0.tgz at the root
pnpm editor:package       # dist/twill.vsix
pnpm editor:test          # real VS Code extension-host tests against the VSIX
# Headless Linux:
xvfb-run -a pnpm editor:test
```

`pnpm --filter @swiftuijs/twill build` builds only the compiler. `pnpm editor:build` builds the editor and its compiler/bridge dependencies. Fresh workspace imports need a build because they deliberately resolve through package exports. No npm lockfile or hoisted workspace installation is required. An independent npm consumer still installs and validates the public tarball as part of `pnpm test:package`.

Coverage scopes, regression gates and edge-case contracts are described in [testing](./testing.md).

## Example and editor checks

All eight [examples](../../examples/README.md) are private workspace packages with their own dependencies and tests. Run `pnpm test:examples` for execution and real component rendering. `pnpm --filter @swiftuijs/twill-example-react dev` starts the React example.

Real extension-host tests load the extracted VSIX, request providers, apply completion/import/rename/quick-fix edits to unsaved documents and inspect original-source breakpoints. Use `pnpm editor:package` followed by `pnpm editor:test`; Regular CI runs stable with coverage; releases and manual compatibility validation also run VS Code 1.95.3. `TWILL_TEST_VSCODE_VERSION` selects a download; `TWILL_TEST_VSCODE_PATH` uses a local executable.

Application setup belongs in the user [editor guide](../tooling.md), [CLI reference](../cli.md) and [library guide](../libraries.md).

## Build installable artifacts

```sh
pnpm package:core
pnpm package:tooling
pnpm editor:package
pnpm test:packed
pnpm release:manifest
```

The five tarballs and `dist/twill.vsix` can be installed into an independent application. Public package consumer tests must pass without workspace symlinks or hoisted development dependencies. See [releasing](./releasing.md) for review and publication.

## Benchmark changes

```sh
pnpm benchmark --output compiler-results.json
pnpm benchmark:project --output project-results.json
pnpm benchmark:branching --output branching-results.json
pnpm --filter @swiftuijs/twill test:size --output ../../bundle-results.json
```

Compare equivalent native/dialect behavior on the same project and machine. Published [performance results](../performance.md) describe workload scope and limitations; retain environment and build identity with new reports.

## Documentation workspace

`apps/docs` is an independent private package. Canonical Markdown remains in `docs/`; the site consumes it directly, avoiding duplicated references. VitePress uses a scoped, security-patched Vite 6 dependency for the site. Core, tooling, editor and examples retain their Vite 8 builds.

```sh
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
pnpm test:browser # build first; Chromium must be available
```

User-facing pages live directly under `docs/`. `docs/contributing/` and `docs/rfcs/` remain repository references and are excluded from the site, search and sitemap.

The default site base is `/twill/`; set `TWILL_DOCS_BASE=/` for root hosting. GitHub Pages deploys the built `apps/docs/dist` artifact on main updates. Configure the repository Pages source as GitHub Actions before the first deployment. Local search stays in the browser; the Playground uses a reusable, time-limited worker with live compilation and highlighted editors and performs syntax lowering only. It does not upload source, execute input or supply project type diagnostics.

## CI workflows

`CI` verifies each push and pull request on Ubuntu 24.04 with Node 22, then checks independently installed packages on Node 20. It runs unit suites with coverage once and retains actual browser/editor tests and deterministic size gates. The `Extended validation` workflow is manual: select compatibility checks for Windows, macOS, Node 24 and the minimum supported editor, or benchmarks for timing reports. Use it before a release and when changing platform-sensitive behavior.

The tag release workflow calls the same CI verification and publishes its tested tarballs and VSIX without another build. Documentation deployment builds independently, triggered only by site content, compiler/formatter/highlighter dependencies, shared dependency manifests or its own workflow; it can also be run manually.
