# Releasing

Repository delivery does not automatically publish to npm or the VS Code Marketplace. A maintainer chooses and publishes a reviewed version.

1. Update the root, `packages/twill/package.json`, `editors/vscode/package.json` and its private `twill-typescript-plugin/package.json` versions together. Record changes in `CHANGELOG.md` and refresh `pnpm-lock.yaml` with `pnpm install`.
2. Run `pnpm install --frozen-lockfile && pnpm check && pnpm format:check` from a clean checkout. Run the real packaged-editor checks with `pnpm editor:test` (headless Linux: `xvfb-run -a pnpm editor:test`). All supported CI jobs must pass.
3. Run `pnpm package:core` and inspect `swiftuijs-twill-0.6.0.tgz`: exports, declarations, executable launcher, licenses and bundled files. The private workspace root and editor packages are not npm publication targets. The tarball excludes the VSIX; CI distributes it separately.
4. Create a release tag such as `v0.6.0`. The tag workflow builds, validates and attaches `swiftuijs-twill-0.6.0.tgz` and `twill.vsix` to a GitHub release.
5. With authorization and the appropriate registry identity, publish the reviewed compiler tarball with `npm publish ./swiftuijs-twill-0.6.0.tgz --access public`. Publish the reviewed `dist/twill.vsix` through the Marketplace publisher workflow or VSCE. Do not publish a private workspace package or a symlink-dependent checkout. Credentials are not stored in this repository.

Download the VSIX from the GitHub release or CI artifacts and install it through VS Code's **Install from VSIX** command. The `swiftuijs` publisher must exist and be controlled by the maintainer before Marketplace publication.

Syntax remains experimental in the 0.x line. Changes that alter parsing, implicit returns, label lowering or component collection require explicit changelog entries and compatibility tests.
