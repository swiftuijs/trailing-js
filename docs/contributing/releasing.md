# Releasing

Repository delivery does not automatically publish to npm or the VS Code Marketplace. A maintainer chooses and publishes a reviewed version.

1. Update the root, all four public packages (`packages/twill`, `packages/formatter`, `packages/linter`, `packages/export`), `editors/vscode` and its private TS-server bridge versions together. Add a changelog entry and refresh `pnpm-lock.yaml`. `pnpm verify:release` rejects mismatched versions; the tag workflow also rejects tags that differ from the package version.
2. Run `pnpm install --frozen-lockfile && pnpm check` in a clean checkout. Run real packaged-editor checks (`xvfb-run -a pnpm editor:test` on headless Linux), and browser checks (`pnpm --filter @swiftuijs/twill-docs exec playwright install --with-deps chromium && pnpm test:browser`). All supported CI jobs must pass.
3. Run `pnpm package:core && pnpm package:tooling`, `pnpm test:packed` and `pnpm release:manifest`. Inspect all four tarballs and `dist/twill.vsix`. Independent installations test public exports/types, CLI, loaders, Prettier, ESLint, native source export and library declaration consumption.
4. A reviewed tag such as `v0.9.0` triggers a fresh build, validation and GitHub release with the four tarballs, VSIX and SHA-256 release manifest. It does not publish to registries. The private workspace root, examples, docs and editor packages are not npm publication targets.
5. With authorization and the appropriate registry identity, publish the reviewed compiler tarball first (`npm publish ./swiftuijs-twill-0.9.0.tgz --access public`), then formatter/linter tarballs of the same version, followed by the export tarball. Their packed workspace dependencies become registry versions. Publish the reviewed VSIX through the maintainer's Marketplace publisher workflow. Never publish a symlink-dependent checkout; credentials are not stored here.

Install the downloaded VSIX through VS Code's **Install from VSIX** command. The `swiftuijs` Marketplace publisher must exist and be controlled by the maintainer before publication.

`release-manifest.json` records the release version, artifact byte sizes and SHA-256 checksums. Compare a downloaded file's checksum with its manifest entry (`sha256sum <file>` on Linux, or `Get-FileHash <file> -Algorithm SHA256` in PowerShell). Compressed artifact budgets are part of this gate; all four public packages have independent consumer checks, including export followed by native `tsc` and Node execution without Twill hooks.

Documentation deploys independently through `.github/workflows/docs.yml`. It builds the canonical references and compiler worker, uploads a Pages artifact, then deploys it. Pages must be enabled with **GitHub Actions** as the source. The site is static and can also be hosted from `apps/docs/dist` elsewhere; adjust `TWILL_DOCS_BASE` for another path.

Syntax remains experimental in the 0.x line. Parsing, implicit-return, label-lowering or component-collection changes need explicit changelog entries and compatibility tests. The support matrix and remaining limits are in [readiness](../readiness.md).
