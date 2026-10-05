# Monorepo and tooling

Use Node 22.13+ and the pnpm version pinned in the root `packageManager`. `corepack enable` enables pnpm where Corepack is available; otherwise install that pnpm version separately. The distributed compiler also supports Node 20.19+; the repository build/test tools require Node 22+.

## Layout

| Workspace                                | Role                                                                                                 | Build                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `packages/twill`                         | Public `@swiftuijs/twill`: compiler, CLI, checker, Node loader, shared editor API and build adapters | Vite library mode emits ESM and the CJS TS-server entry; `vite-plugin-dts` emits tool API declarations          |
| `packages/formatter`                     | Public `@swiftuijs/twill-formatter`: Prettier plugin                                                 | Vite library mode and API declarations                                                                          |
| `packages/linter`                        | Public `@swiftuijs/twill-linter`: ESLint processor and recommended configs                           | Vite library mode and API declarations                                                                          |
| `examples/*`                             | Seven private applications/libraries, each with its own manifest                                     | Local Vite configurations; library adds declaration emission                                                    |
| `editors/vscode`                         | VS Code extension and TextMate grammars                                                              | Vite bundles a standalone CJS extension; preparation copies standard-library declarations, schemas and licenses |
| `editors/vscode/twill-typescript-plugin` | Private `@swiftuijs/twill-vscode-tsserver` bridge bundled in the VSIX                                | Vite bundles a CJS TS-server plugin                                                                             |
| `apps/docs`                              | Private VitePress site, English reference, local search and compiler worker playground               | VitePress static site; shared `docs/` references                                                                |
| Root                                     | Workspace coordination, shared configuration and release gates                                       | Private pnpm workspace coordinator; not a published package                                                     |

Workspace dependencies order builds and use public compiler exports. Vite 8 uses Rolldown for repository bundles; there is no separate tsup/esbuild build pipeline. esbuild remains a supported consumer adapter and is used in adapter/native-output tests. Examples exercise ordinary functions, cleanup, mixed TS/JS, React and Vue. No compiler special case exists for `@swiftuijs/ui`.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm build                # all workspace bundles and compiler declarations
pnpm check                # build, typecheck, tests, consumer checks, packaged VSIX probes
pnpm format:check
pnpm test:coverage
pnpm package:core         # swiftuijs-twill-0.8.0.tgz at the root
pnpm editor:package       # dist/twill.vsix
pnpm editor:test          # real VS Code extension-host tests against the VSIX
# Headless Linux:
xvfb-run -a pnpm editor:test
```

`pnpm --filter @swiftuijs/twill build` builds only the compiler. `pnpm editor:build` builds the editor and its compiler/bridge dependencies. Fresh workspace imports need a build because they deliberately resolve through package exports. No npm lockfile or hoisted workspace installation is required. An independent npm consumer still installs and validates the public tarball as part of `pnpm test:package`.

## Editor and debugging tools

The VSIX supports completion, partial React prop keys and contextual callback members, hover/signatures/navigation, diagnostics, auto-imports, mixed-file rename, import organization and safe quick fixes. Selecting a completion applies edits to original Twill text. Renaming a local shorthand prop value keeps the public prop key; renaming the contract keeps the local binding. Native TS/JS import-alias rename follows TypeScript semantics. Source edits are rejected when they cannot be represented safely in the dialect; document formatting is bundled; full refactoring/fix-all is not advertised.

**Twill: Show Generated TypeScript** displays the lowered document. **Twill: Show Project Diagnostics** displays configuration, source counts, versions, diagnostics and check duration. The same report is available from the CLI:

```sh
pnpm exec twill doctor -p examples/mixed/tsconfig.json --json
# In an application with the compiler installed:
npx twill doctor -p tsconfig.json --json
```

The report includes filenames, compiler settings and diagnostic text, but does not dump source contents or environment variables. A failing project returns a nonzero CLI status.

**Twill: Debug Current File** starts VS Code's built-in Node debugger with `--enable-source-maps --import @swiftuijs/twill/register`. Install the compiler in the application first; the extension bundles checking tools, not an application runtime installation. Set normal breakpoints in the `.twill` file. The command runs the selected file, so imported entry points and application environment should be configured through your normal Node launch configuration when needed.

Browser applications use existing browser, React and Vue developer tools: emitted code has ordinary framework semantics and source maps. Twill needs no extra runtime inspector. For Vite 8 React development, use [the Fast Refresh adapter](frameworks.md). `.vue` SFC processing remains the responsibility of the standard Vue plugin.

## Validation and boundaries

Real extension-host tests load the extracted VSIX, request providers, apply completion/import/rename/quick-fix edits to unsaved documents, verify generated/report views, and inspect Node stack frames and source breakpoints. CI runs the minimum supported VS Code 1.95.3 and stable. `TWILL_TEST_VSCODE_VERSION` selects a download; `TWILL_TEST_VSCODE_PATH` uses a local executable.

The checker/editor currently use TypeScript 5.9. User libraries can emit native declarations with `twill declarations`; `--build` visits referenced declaration projects first. This is a full declaration build, without incremental `.tsbuildinfo` or JS emission; Vite handles JS builds. See [readiness](readiness.md) and [performance](performance.md) for the remaining adoption limits.

## Formatter and linter packages

`packages/formatter` builds `@swiftuijs/twill-formatter`, a Prettier 3.9 plugin. `packages/linter` builds `@swiftuijs/twill-linter`, an ESLint 9/10 flat-config plugin with syntactic and optional typed rules. Both use Vite library builds, public package exports and independent npm consumer verification. The [formatter guide](../packages/formatter/README.md) and [linter guide](../packages/linter/README.md) show application configuration. No library/component registry is involved.

```sh
pnpm lint
pnpm lint:fix
pnpm format
pnpm package:tooling
pnpm test:tooling         # independent npm install of all three tarballs
pnpm --filter twill package   # editor's own packaging entry
pnpm --filter twill test      # editor's own host-test entry
```

All seven [examples](../examples/README.md) are private workspace packages with local dependencies, Vite builds, type checking, formatting and lint commands. For example, `pnpm --filter @swiftuijs/twill-example-react dev` runs the React package; `pnpm --filter @swiftuijs/twill-example-library build` emits an ordinary ESM library and declarations.

## User-library declarations

```sh
pnpm exec twill declarations -p tsconfig.json -o dist
pnpm exec twill declarations -p packages/app/tsconfig.json --build --json
```

Use Vite library mode for JS output, then the declaration command for `.d.ts` and composed `.d.ts.map` output. Declaration module specifiers use ordinary `.js`/`.mjs`/`.cjs` names. Maps refer to original Twill/TS sources. Do not combine same-basename native and Twill files in one output directory: collisions are rejected. Errors prevent writes for the failing project; dependencies already emitted in a reference build remain on disk.

`--build` traverses tsconfig references in dependency order and consumes their declarations; circular references fail explicitly. Referenced projects use their configured `declarationDir`/`outDir` (otherwise `dist`); `-o` overrides only the root project, relative to the current working directory. This emits declarations only, without incremental caching or `.tsbuildinfo`. The ordinary `twill check` command still checks one project at a time. For published libraries, set package `exports.types` to the generated entry declaration and `exports.import` to the Vite JS entry, as in the library example. Native consumers require neither Twill source parsing nor a Twill editor plugin.

## Documentation workspace

`apps/docs` is an independent private package. Canonical Markdown remains in `docs/`; the site consumes it directly, avoiding duplicated references. VitePress uses a scoped, security-patched Vite 6 dependency for the site. Core, tooling, editor and examples retain their Vite 8 builds.

```sh
pnpm docs:dev
pnpm docs:build
pnpm docs:preview
pnpm test:browser # build first; Chromium must be available
```

The default site base is `/twill/`; set `TWILL_DOCS_BASE=/` for root hosting. GitHub Pages deploys the built `apps/docs/dist` artifact on main updates. Configure the repository Pages source as GitHub Actions before the first deployment. Local search stays in the browser; the Playground uses a reusable, time-limited worker with live compilation and highlighted editors and performs syntax lowering only. It does not upload source, execute input or supply project type diagnostics.
