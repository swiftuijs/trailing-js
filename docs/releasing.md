# Releasing

Repository delivery does not automatically publish to npm or the VS Code Marketplace. A maintainer chooses and publishes a reviewed version.

1. Update `package.json` and `editors/vscode/package.json` together, record changes in `CHANGELOG.md`, and refresh the lockfile.
2. Run `npm ci && npm run check && npm run format:check` from a clean checkout. All supported CI jobs must pass.
3. Run `npm pack --dry-run` and inspect exports, declarations, licenses, and bundled files. The npm tarball excludes the VSIX; CI distributes it as a separate artifact.
4. Create a release tag such as `v0.3.0`. The tag workflow builds and attaches `swiftuijs-twill-0.3.0.tgz` and `twill.vsix` to a GitHub release.
5. With authorization and the appropriate registry identity, run `npm publish --access public` and `npx vsce publish` from `editors/vscode`. Credentials are not stored in this repository.

Download the VSIX from the GitHub release or CI artifacts and install it through VS Code's **Install from VSIX** command. The `swiftuijs` publisher must exist and be controlled by the maintainer before Marketplace publication.

Syntax remains experimental in the 0.x line. Changes that alter parsing, implicit returns, label lowering, or builder collection require explicit changelog entries and compatibility tests.
