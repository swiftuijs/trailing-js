# Releasing

Repository delivery does not automatically publish to npm or the VS Code Marketplace. A maintainer chooses and publishes a reviewed version.

Review `skills/twill/SKILL.md` and its `metadata.release` baseline together with supported syntax and tooling. `pnpm verify:release` checks that baseline; `pnpm verify:skills` validates actual examples. The official skill can receive documentation updates independently of npm releases. Docs builds regenerate its download and discovery digest, and changes under `skills/**` trigger the documentation workflow.

1. Update the root, all eight public packages (`packages/twill`, `packages/formatter`, `packages/linter`, `packages/export`, `packages/highlight`, `packages/runtime`, `packages/shell`, `packages/shell-native`), `editors/vscode` and its private TS-server bridge versions together. Add a changelog entry and refresh `pnpm-lock.yaml`. `pnpm verify:release` rejects mismatched versions; the optional release workflow also rejects tags that differ from the package version.
2. Run `pnpm install --frozen-lockfile && pnpm check` in a clean checkout. Run real packaged-editor checks (`xvfb-run -a pnpm editor:test` on headless Linux), and browser checks (`pnpm --filter @swiftuijs/twill-docs exec playwright install --with-deps chromium && pnpm test:browser`). For direct server publication, run the required checks locally, including the minimum supported VS Code host and independent package consumers. The manual `Extended validation` workflow is an optional way to obtain additional platform evidence.
3. Run `pnpm package:core && pnpm package:tooling`, `pnpm test:packed` and `pnpm release:manifest`. Inspect the seven standard tarballs and the separately assembled native tarball and `dist/twill.vsix`. Independent installations test public exports/types, CLI, loaders, Prettier, ESLint, native source export and library declaration consumption.
4. Create a reviewed tag such as `v0.1.0` at the tested commit and upload the exact locally validated artifacts to its GitHub Release. Creating a tag does not launch a release workflow. The optional `Package release` workflow must be dispatched explicitly at the release tag if a maintainer chooses CI-based packaging; it does not publish to registries. The private workspace root, examples, docs and editor packages are not npm publication targets.
5. With authorization and the appropriate registry identity, publish the reviewed optional runtime tarball, and shell tarballs, then the compiler tarball (`npm publish ./swiftuijs-twill-0.1.0.tgz --access public`), then formatter/linter tarballs of the same version, followed by the export and highlight tarballs. Their packed workspace dependencies become registry versions. Publish the reviewed VSIX through the maintainer's Marketplace publisher workflow. Never publish a symlink-dependent checkout; credentials are not stored here.

Install the downloaded VSIX through VS Code's **Install from VSIX** command. The `forth-ink` Marketplace publisher, displayed as **forth.ink**, must exist and be controlled by the maintainer before publication.

`release-manifest.json` records the release version, artifact byte sizes and SHA-256 checksums. Compare a downloaded file's checksum with its manifest entry (`sha256sum <file>` on Linux, or `Get-FileHash <file> -Algorithm SHA256` in PowerShell). Compressed artifact budgets are part of this gate; all eight public packages have independent consumer checks, including export followed by native `tsc` and Node execution without Twill hooks.

Documentation deploys independently through `.github/workflows/docs.yml`. It builds the canonical references and compiler worker, uploads a Pages artifact, then deploys it. Pages must be enabled with **GitHub Actions** as the source. The site is static and can also be hosted from `apps/docs/dist` elsewhere; adjust `TWILL_DOCS_BASE` for another path.

## Documentation domain

The canonical website is `https://twill.evecalm.com`. Builds use `/` as the default base, with canonical page links, a sitemap and `robots.txt` for this domain.

1. In the DNS zone for `evecalm.com`, add a **CNAME** record named `twill` targeting `swiftuijs.github.io`. Use the DNS provider's default TTL. The target is a hostname, without a scheme or `/twill` path. Remove conflicting records for the same `twill` name. If using Cloudflare, select **DNS only** while GitHub validates the domain and provisions HTTPS.
2. In [repository Pages settings](https://github.com/swiftuijs/twill/settings/pages), keep the deployment source as **GitHub Actions** and set **Custom domain** to `twill.evecalm.com`. The `public/CNAME` file is copied into the build, but Actions-based Pages deployments require this repository setting; the file does not configure it automatically.
3. Run the **Documentation** workflow after saving the custom domain. It reads the Pages configuration and builds at `/` for a custom domain; before the setting is enabled it preserves `/twill/` for the default repository URL. Wait for the DNS check and certificate provisioning to finish, then enable **Enforce HTTPS**. Check the homepage, a guide such as `/getting-started`, `/playground`, and `/sitemap.xml` on the new domain. GitHub Pages redirects the default repository URL after the custom domain is configured.

Repository owners can additionally verify `evecalm.com` in the `swiftuijs` organization's Pages settings. GitHub supplies a TXT challenge; publish that exact value instead of guessing it. Verification protects the domain against use by other GitHub accounts.

Syntax remains experimental in the 0.x line. Parsing, implicit-return, label-lowering or component-collection changes need explicit changelog entries and compatibility tests. The support matrix and remaining limits are in [readiness](../readiness.md).

## Brand and publisher

Twill is a [forth.ink](https://forth.ink) product. Marketplace uses publisher ID `forth-ink`, display name **forth.ink**, and extension ID `forth-ink.twill`. The publisher ID is a technical identifier: VSCE accepts letters, digits and hyphens, so a domain containing a dot cannot be used as the ID. Create or confirm the exact ID in the [publisher management portal](https://marketplace.visualstudio.com/manage) before publishing; the display name and website can use `forth.ink` and `https://forth.ink`.

GitHub repository URLs, the live documentation URL and npm's `@swiftuijs` scope identify their actual hosting locations. They are separate from the displayed brand. The npm packages' author metadata and the documentation footer identify forth.ink.

## Marketplace publication

The optional manually dispatched workflow creates a GitHub Release; it does not upload to Marketplace. A maintainer can upload the tested `twill.vsix` through the publisher portal without creating a token. Use the exact released VSIX rather than rebuilding it for publication.

For command-line publishing, use the Microsoft account that owns the publisher or has publication rights. Microsoft's [publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) describes authentication and publisher setup.

### Create a PAT for short-term publication

1. Sign into [Azure DevOps](https://dev.azure.com/) and create an organization if needed. Use the Microsoft account associated with the Marketplace publisher.
2. Open **User settings → Personal access tokens → New Token**.
3. Name it `twill-marketplace`, select **All accessible organizations**, and choose a short expiration, such as 30 days.
4. Select **Custom defined → Show all scopes → Marketplace → Manage**, then create the token. Save the value when shown; it is displayed once.
5. From the repository root, run `pnpm --filter twill exec vsce login forth-ink` and enter the token at the prompt. It is an Azure DevOps token, not a GitHub or npm token.
6. Publish the validated VSIX: `pnpm --filter twill exec vsce publish --packagePath ../../dist/twill.vsix`. For a GitHub Release download, place that exact file at `dist/twill.vsix` first. The default build is not marked as a Marketplace pre-release. To choose that channel, package with `--pre-release` before testing and generating the release manifest; adding the flag only to publication of an unmarked VSIX is rejected by VSCE.

For GitHub Actions verification, store the token as a repository Actions secret named `VSCE_PAT` under **Settings → Secrets and variables → Actions → Secrets**, rather than an Actions variable. To check it without publishing, run **Actions → Marketplace credentials → Run workflow** on `main` (or `gh workflow run marketplace-check.yml --ref main`). The task checks secret availability and runs VSCE's `verify-pat` against `forth-ink`. This confirms authentication and publisher access; the publisher account still needs publication rights and the token needs Marketplace Manage scope. The task is manual and does not add checks to ordinary CI or upload extensions. Adding the secret alone does not enable Marketplace uploads. Do not put the token in source files or logs.

### Publish from a managed Codex environment

A Codex **Network Access Token** binding is separate from a GitHub Actions secret. Bind the Marketplace PAT to the `VSCE_PAT` environment variable and permit the Marketplace API host, `marketplace.visualstudio.com`. Apply the published environment configuration to the active session before checking it; a saved configuration alone does not establish that the current environment has loaded it.

Run `pnpm --filter twill exec vsce verify-pat forth-ink` with the inherited proxy and credential binding. A proxy placeholder is expected in this setup; do not print the variable, copy it into a file or replace the proxy settings. Verification confirms authentication and publisher access, not a completed publication. Publish only the already tested VSIX when release authorization is given.

### Use identity-based authentication for ongoing publication

Microsoft will retire global Azure DevOps PATs on **December 1, 2026**, including those covering all accessible organizations. [The retirement announcement](https://devblogs.microsoft.com/devops/retirement-of-global-personal-access-tokens-in-azure-devops/) confirms that creation remains available until that date. PATs are a short-term option; they are not the long-term authentication plan.

For ongoing automation, follow Microsoft's [secure automated publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace): configure Microsoft Entra ID workload federation, grant the identity access to the publisher, and publish the same tested VSIX with `vsce publish --azure-credential --packagePath <path>`. Identity setup is separate from building and testing Twill.

## Review user-facing release material

Before publishing, check the root/npm READMEs, installation guide, package metadata and extension homepage against the tested artifacts. Public instructions install packages by name; local tarball paths belong to contributor and release verification guides. Twill has no earlier public releases, so the changelog describes the initial release rather than internal development milestones.

The packaged extension homepage already describes the normal installation flow so the first published VSIX needs no replacement just to remove a pending-release notice. After Marketplace publication succeeds, replace the temporary VSIX installation instructions in `docs/tooling.md` with the verified listing URL and `code --install-extension forth-ink.twill`. Add the listing link to the root README. Confirm the live npm READMEs and Marketplace page render correctly. Registry links in prepared documentation do not establish that the corresponding packages have already been published.

The unreleased optional runtime adds `@swiftuijs/twill-runtime` to coordinated archive/version checks, the 8 KiB compressed package budget and independently installed Node 20 consumers. Include its archive and manifest entry in the next coordinated release. The compiler does not depend on the runtime package; applications/libraries selecting external emission declare it as a production dependency. Helper ABI `helpers/v1` must retain its contract across compatible releases.

The unreleased shell SDK is a separate Node-only, zero-production-dependency package. Its archive has a 16 KiB compressed gate and independent native JS/TS consumer tests on Node 20. Add its exact tarball and manifest entry to the next coordinated release; implementing/merging the prototype does not publish it. Run the focused Windows/macOS subprocess CI and the native comparison `pnpm benchmark:shell --output ../../shell-results.json --verify-performance` before release.

The optional production-contract native backend remains unpublished. Build/test all five supported targets through `native-platforms`; `native-assemble` combines exactly those validated binaries without recompiling, verifies complete target coverage/source hashes/protocol/version and writes `native-release-manifest.json`. Each binary is at most 2 MiB; the native tarball is at most 6 MiB compressed. Its SDK dependency still obeys the original 16 KiB gate. Do not publish a host-only local archive as the coordinated package. The manual release workflow downloads both standard and native validated artifacts/manifests. Publish the SDK before the native package when a coordinated release is authorized; install-time compilation or downloading is not allowed.
