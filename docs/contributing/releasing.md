# Releasing

Repository delivery does not automatically publish to npm or the VS Code Marketplace. A maintainer chooses and publishes a reviewed version.

1. Update the root, all five public packages (`packages/twill`, `packages/formatter`, `packages/linter`, `packages/export`, `packages/highlight`), `editors/vscode` and its private TS-server bridge versions together. Add a changelog entry and refresh `pnpm-lock.yaml`. `pnpm verify:release` rejects mismatched versions; the tag workflow also rejects tags that differ from the package version.
2. Run `pnpm install --frozen-lockfile && pnpm check` in a clean checkout. Run real packaged-editor checks (`xvfb-run -a pnpm editor:test` on headless Linux), and browser checks (`pnpm --filter @swiftuijs/twill-docs exec playwright install --with-deps chromium && pnpm test:browser`). Run the manual `Extended validation` workflow with `compatibility` enabled for the intended commit; regular CI and these compatibility checks must pass.
3. Run `pnpm package:core && pnpm package:tooling`, `pnpm test:packed` and `pnpm release:manifest`. Inspect all five tarballs and `dist/twill.vsix`. Independent installations test public exports/types, CLI, loaders, Prettier, ESLint, native source export and library declaration consumption.
4. A reviewed tag such as `v0.9.0` calls the regular CI verification with the minimum supported editor enabled, then creates a GitHub release from those exact validated artifacts with the five tarballs, VSIX and SHA-256 release manifest. It does not publish to registries. The private workspace root, examples, docs and editor packages are not npm publication targets.
5. With authorization and the appropriate registry identity, publish the reviewed compiler tarball first (`npm publish ./swiftuijs-twill-0.9.0.tgz --access public`), then formatter/linter tarballs of the same version, followed by the export and highlight tarballs. Their packed workspace dependencies become registry versions. Publish the reviewed VSIX through the maintainer's Marketplace publisher workflow. Never publish a symlink-dependent checkout; credentials are not stored here.

Install the downloaded VSIX through VS Code's **Install from VSIX** command. The `forth-ink` Marketplace publisher, displayed as **forth.ink**, must exist and be controlled by the maintainer before publication.

`release-manifest.json` records the release version, artifact byte sizes and SHA-256 checksums. Compare a downloaded file's checksum with its manifest entry (`sha256sum <file>` on Linux, or `Get-FileHash <file> -Algorithm SHA256` in PowerShell). Compressed artifact budgets are part of this gate; all five public packages have independent consumer checks, including export followed by native `tsc` and Node execution without Twill hooks.

Documentation deploys independently through `.github/workflows/docs.yml`. It builds the canonical references and compiler worker, uploads a Pages artifact, then deploys it. Pages must be enabled with **GitHub Actions** as the source. The site is static and can also be hosted from `apps/docs/dist` elsewhere; adjust `TWILL_DOCS_BASE` for another path.

Syntax remains experimental in the 0.x line. Parsing, implicit-return, label-lowering or component-collection changes need explicit changelog entries and compatibility tests. The support matrix and remaining limits are in [readiness](../readiness.md).

## Brand and publisher

Twill is a [forth.ink](https://forth.ink) product. Marketplace uses publisher ID `forth-ink`, display name **forth.ink**, and extension ID `forth-ink.twill`. The publisher ID is a technical identifier: VSCE accepts letters, digits and hyphens, so a domain containing a dot cannot be used as the ID. Create or confirm the exact ID in the [publisher management portal](https://marketplace.visualstudio.com/manage) before publishing; the display name and website can use `forth.ink` and `https://forth.ink`.

GitHub repository URLs, the live documentation URL and npm's `@swiftuijs` scope identify their actual hosting locations. They are separate from the displayed brand. The npm packages' author metadata and the documentation footer identify forth.ink.

## Marketplace publication

The tag workflow creates a GitHub Release; it does not upload to Marketplace. A maintainer can upload the tested `twill.vsix` through the publisher portal without creating a token. Use the exact released VSIX rather than rebuilding it for publication.

For command-line publishing, use the Microsoft account that owns the publisher or has publication rights. Microsoft's [publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) describes authentication and publisher setup.

### Create a PAT for short-term publication

1. Sign into [Azure DevOps](https://dev.azure.com/) and create an organization if needed. Use the Microsoft account associated with the Marketplace publisher.
2. Open **User settings → Personal access tokens → New Token**.
3. Name it `twill-marketplace`, select **All accessible organizations**, and choose a short expiration, such as 30 days.
4. Select **Custom defined → Show all scopes → Marketplace → Manage**, then create the token. Save the value when shown; it is displayed once.
5. From the repository root, run `pnpm --filter twill exec vsce login forth-ink` and enter the token at the prompt. It is an Azure DevOps token, not a GitHub or npm token.
6. Publish the validated VSIX: `pnpm --filter twill exec vsce publish --packagePath ../../dist/twill.vsix`. For a GitHub Release download, place that exact file at `dist/twill.vsix` first. The default build is not marked as a Marketplace pre-release. To choose that channel, package with `--pre-release` before testing and generating the release manifest; adding the flag only to publication of an unmarked VSIX is rejected by VSCE.

For future GitHub Actions integration, store the token as a repository Actions secret named `VSCE_PAT` under **Settings → Secrets and variables → Actions** and pass it only to the publishing step. Adding this secret alone does not enable Marketplace uploads in the current workflow. Do not put the token in source files or logs.

### Use identity-based authentication for ongoing publication

Microsoft will retire global Azure DevOps PATs on **December 1, 2026**, including those covering all accessible organizations. [The retirement announcement](https://devblogs.microsoft.com/devops/retirement-of-global-personal-access-tokens-in-azure-devops/) confirms that creation remains available until that date. PATs are a short-term option; they are not the long-term authentication plan.

For ongoing automation, follow Microsoft's [secure automated publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace): configure Microsoft Entra ID workload federation, grant the identity access to the publisher, and publish the same tested VSIX with `vsce publish --azure-credential --packagePath <path>`. Identity setup is separate from building and testing Twill.
