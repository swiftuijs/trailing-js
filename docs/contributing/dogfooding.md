# Developing Twill tooling in Twill

Handwritten implementation sources outside the compiler use `.twill` / `.twillx`. The formatter, linter, checked export, highlighter, shell SDK and both editor packages exercise the same published compiler APIs as application projects. Native TypeScript is valid Twill; use an extension when it makes the implementation clearer without unnecessary runtime cost.

## Build and check

Use the repository's Node/pnpm versions and install dependencies first. A fresh checkout needs the native compiler bootstrap before Twill-built tooling can run:

```sh
pnpm install --frozen-lockfile
pnpm --filter @swiftuijs/twill... run build
pnpm --filter @swiftuijs/twill-formatter build
pnpm --filter @swiftuijs/twill-formatter typecheck
pnpm --filter @swiftuijs/twill-formatter test:coverage
pnpm build
pnpm check
```

`pnpm build` orders workspace dependencies automatically. The shell SDK uses Node spawn/streams and requires no native build; see [tooling](./tooling.md) and [releasing](./releasing.md). The SDK retains source paths and position mappings but removes repeated embedded source text from its build maps, matching its former native build and preserving the 16 KiB archive budget. This does not change the test adapter's original-source coverage maps.

Vite configurations use `@swiftuijs/twill/vite`. Public packages emit declarations with `twill declarations -p tsconfig.build.json -o dist`; use `rootDir: "src"` so exported types stay at their established `dist` paths. Type checks use `twill check`, including native test files importing Twill. Plain `tsc` cannot parse implementation sources directly.

Use the actual source suffix in relative imports, for example `./values.twill`. Declaration emission rewrites dialect imports to native `.js` specifiers. Package export paths and consumer imports remain ordinary JS; do not expose `.twill` entries as a replacement for built exports. Shell packages keep the compiler as a development dependency, with no compiler installation needed by native JS/TS consumers.

## Bootstrap and host boundaries

- `packages/twill` remains JS/TS so a checkout can build its first compiler without an older installed compiler.
- `packages/runtime` retains its canonical JS helper, which the bootstrap generator reads before compiler build. Moving it behind a compiler dependency would introduce a cycle.
- Build/configuration/release scripts and installation/interop test harnesses use formats understood directly by their host. Tests intentionally mix native sources with Twill fixtures.
- The documentation app keeps Vue SFCs and native support code: its Vue-aware checker has no Twill source integration yet. This is a host boundary, not a claim that the compiler is self-hosted.

`pnpm verify:dogfood` checks all package/editor `src` directories, including new packages, and rejects native implementations outside the two explicit bootstrap exceptions. It runs in release verification. Record the concrete reason and update the policy when a new host/bootstrap exception is needed.

## Find language problems through real use

Preserve public APIs and natural native fast paths. When valid TypeScript fails in Twill, add compiler execution, negative, checking and declaration-consumer regressions and repair the compatibility boundary. Do not hide a parser issue by renaming an existing public type/value pair. New Twill syntax or semantics still follows the [RFC process](../rfcs/README.md).

Keep tests with their owning package. Coverage must include every original `.twill` module, including packaged `extension.twill`; preserve thresholds and source maps. Run independently installed archives on the minimum Node runtime and actual VSIX host checks after changing build inputs. Shared-shell/dependency/build changes run actual platform contracts. Compare generated costs against equivalent native code, and retain archive budgets and production dependency boundaries. See [testing](./testing.md) for the complete checks.
