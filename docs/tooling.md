# Monorepo and tooling

Use Node 22.12+ and the pnpm version pinned in the root `packageManager`. `corepack enable` enables pnpm where Corepack is available; otherwise install that pnpm version separately. The distributed compiler also supports Node 20.19+; the repository build/test tools require Node 22+.

## Layout

| Workspace                                | Role                                                                                                    | Build                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `packages/twill`                         | Published `@swiftuijs/twill`: compiler, CLI, checker, Node loader, shared editor API and build adapters | Vite library mode emits ESM and the CJS TS-server entry; `vite-plugin-dts` emits tool API declarations          |
| `editors/vscode`                         | VS Code extension and TextMate grammars                                                                 | Vite bundles a standalone CJS extension; preparation copies standard-library declarations, schemas and licenses |
| `editors/vscode/twill-typescript-plugin` | Private `@swiftuijs/twill-vscode-tsserver` bridge bundled in the VSIX                                   | Vite bundles a CJS TS-server plugin                                                                             |
| Root                                     | Shared tests, examples, scripts, configuration and release gates                                        | Private pnpm workspace coordinator; not a published package                                                     |

Workspace dependencies order builds and use public compiler exports. Vite 8 uses Rolldown for repository bundles; there is no separate tsup/esbuild build pipeline. esbuild remains a supported consumer adapter and is used in adapter/native-output tests. Examples exercise ordinary functions, cleanup, mixed TS/JS, React and Vue. No compiler special case exists for `@swiftuijs/ui`.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm build                # all workspace bundles and compiler declarations
pnpm check                # build, typecheck, tests, consumer checks, packaged VSIX probes
pnpm format:check
pnpm test:coverage
pnpm package:core         # swiftuijs-twill-0.6.0.tgz at the root
pnpm editor:package       # dist/twill.vsix
pnpm editor:test          # real VS Code extension-host tests against the VSIX
# Headless Linux:
xvfb-run -a pnpm editor:test
```

`pnpm --filter @swiftuijs/twill build` builds only the compiler. `pnpm editor:build` builds the editor and its compiler/bridge dependencies. Fresh workspace imports need a build because they deliberately resolve through package exports. No npm lockfile or hoisted workspace installation is required. An independent npm consumer still installs and validates the public tarball as part of `pnpm test:package`.

## Editor and debugging tools

The VSIX supports completion, partial React prop keys and contextual callback members, hover/signatures/navigation, diagnostics, auto-imports, mixed-file rename, import organization and safe quick fixes. Selecting a completion applies edits to original Twill text. Renaming a local shorthand prop value keeps the public prop key; renaming the contract keeps the local binding. Native TS/JS import-alias rename follows TypeScript semantics. Source edits are rejected when they cannot be represented safely in the dialect; full refactoring/fix-all and formatting are not advertised.

**Twill: Show Generated TypeScript** displays the lowered document. **Twill: Show Project Diagnostics** displays configuration, source counts, versions, diagnostics and check duration. The same report is available from the CLI:

```sh
pnpm exec twill doctor -p examples/mixed/tsconfig.json --json
# In an application with the compiler installed:
npx twill doctor -p tsconfig.json --json
```

The report includes filenames, compiler settings and diagnostic text, but does not dump source contents or environment variables. A failing project returns a nonzero CLI status.

**Twill: Debug Current File** starts VS Code's built-in Node debugger with `--enable-source-maps --import @swiftuijs/twill/register`. Install the compiler in the application first; the extension bundles checking tools, not an application runtime installation. Set normal breakpoints in the `.twill` file. The command runs the selected file, so imported entry points and application environment should be configured through your normal Node launch configuration when needed.

Browser applications use existing browser, React and Vue developer tools: emitted code has ordinary framework semantics and source maps. Twill needs no extra runtime inspector. `.vue` SFC processing and React Fast Refresh retain their documented integration limits.

## Validation and boundaries

Real extension-host tests load the extracted VSIX, request providers, apply completion/import/rename/quick-fix edits to unsaved documents, verify generated/report views, and inspect Node stack frames and source breakpoints. CI runs the minimum supported VS Code 1.95.3 and stable. `TWILL_TEST_VSCODE_VERSION` selects a download; `TWILL_TEST_VSCODE_PATH` uses a local executable.

The checker/editor currently use TypeScript 5.9. Building declarations for the compiler API does not mean Twill user projects can emit library declarations or use TypeScript project-reference build mode; those are still missing. See [readiness](readiness.md) and [performance](performance.md) for the remaining adoption limits.
