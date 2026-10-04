# Contributing

Use Node 22.12+ and the pnpm version pinned in `packageManager`. Install with `pnpm install --frozen-lockfile`. Run `pnpm check` and `pnpm format:check` before submitting changes. `pnpm test:watch` supports compiler development; `pnpm dev:react` and `pnpm dev:vue` run the examples after a build.

For a syntax change, add execution or negative-diagnostic tests covering the new behavior, nearby ordinary JS/TS syntax, and nesting. For mapping changes, check real diagnostic/editor positions. Build integrations must be exercised with their actual tool. Avoid replacing parser behavior with broad string rewrites.

Keep the compiler independent of frameworks and libraries. Put runtime adaptation in an optional entry point, and use example applications for library-specific usage. Update the syntax contract when behavior or compatibility changes.

The editor can be debugged by opening `editors/vscode` in VS Code, running `pnpm editor:build` at the repository root, and launching its extension host. Install the built VSIX for packaged validation.

The private root coordinates pnpm workspaces: compiler/toolchain in `packages/twill`, extension in `editors/vscode`, and its private TS-server bridge beneath it. Build with `pnpm build` before typechecking editor imports. All package bundles use Vite library mode; compiler declarations are emitted by `vite-plugin-dts`. See [the tooling guide](docs/tooling.md) for commands and artifact paths.

For editor changes, run `pnpm editor:package` then `pnpm editor:test` (headless Linux: `xvfb-run -a pnpm editor:test`). Tests load the extracted VSIX and apply real completion/import/rename/fix edits and inspect Node source breakpoints. `TWILL_TEST_VSCODE_VERSION` selects another test version; `TWILL_TEST_VSCODE_PATH` uses an already downloaded executable. No application code runs during language assistance; starting the explicit debugger does execute the selected application file.
