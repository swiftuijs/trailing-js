# Twill

**Clearer flow. Same TypeScript.**

Twill is a small syntax-sugar language for JavaScript and TypeScript. Make validation, cleanup and business states explicit with guards, `defer`, trailing closures and checked switch expressions. Compile to ordinary JavaScript, keep TS types and mix Twill with your existing code.

[Documentation](https://swiftuijs.github.io/twill/) · [Why Twill?](docs/why-twill.md) · [Playground](https://swiftuijs.github.io/twill/playground) · [Getting started](docs/getting-started.md) · [Support](docs/readiness.md)

```twill
async function readOwned(acquire: () => Promise<TextDocument>) {
  const document = await acquire();
  defer {
    await document.close();
  }

  guard const text = await document.readText() else {
    return 'Missing';
  }
  return text.toUpperCase();
}
```

The successful path stays in view; release sits next to acquisition. Registration is block-scoped, cleanup is awaited explicitly, and `return await` keeps an owned resource alive until its work finishes. The output uses ordinary JS control flow.

**Status:** experimental 0.9. The documented toolchain is tested, including real VS Code hosts and independent package installs. Packages are available as built tarballs and a VSIX; npm and Marketplace publication are pending. Use a scoped pilot before a production commitment. See [readiness and adoption limits](docs/readiness.md).

## Why use Twill?

- **Make early exits explicit.** `guard … else` requires an exiting failure path. `guard const` evaluates once, preserves zero and false, and keeps native TS narrowing.
- **Keep cleanup beside ownership.** Register `defer` immediately after acquisition; reached registrations run on scope exit in reverse order, including failures.
- **Catch omitted business states.** Match ordinary TS discriminated unions and bind their payloads. `twill check` verifies expression exhaustiveness when a variant is added.
- **Keep callbacks and composition readable.** Trailing closures work with normal callback APIs. In UI files, component closures become native JSX children or lazy Vue slots.
- **Adopt one module at a time.** Two-way TS/JS imports, standard framework APIs, generated declarations and optional native source export keep the integration incremental.

TypeScript already expresses these behaviors with branches, `try/finally`, arrows and unions. Twill supplies a more explicit syntax for recurring tasks; it earns its place when review clarity outweighs an additional compiler integration. Read the [code comparisons and tradeoffs](docs/why-twill.md).

## Small syntax, existing semantics

```twill
const names = users.filter { user in
  user.active;
}.map { user in
  user.name;
};

type Outcome = { kind: 'ok'; value: number } | { kind: 'error'; message: string };
function describe(outcome: Outcome): string {
  return switch (outcome) {
    case { kind: 'ok', value }: value.toFixed(2);
    case { kind: 'error', message }: message;
  };
}
```

Ordinary closures become arrows; guards become branches. Direct-return switch expressions become native switches; other expression positions use an IIFE. No language runtime library is introduced. `defer` allocates callbacks and dynamic registrations use a local stack; general component child collection uses arrays. These costs are [documented and measured](docs/performance.md).

| File                         | Use                                                         |
| ---------------------------- | ----------------------------------------------------------- |
| `.twill`                     | TypeScript, including JavaScript syntax with optional types |
| `.twillx`                    | TSX, native JSX and component closures                      |
| `.ts`, `.tsx`, `.js`, `.jsx` | Ordinary source files, retaining their native syntax        |

Twill and native files can import each other through the build adapters, virtual checker and Node ESM loader. Your normal `tsconfig.json` supplies types and JSX settings. No `twill.config.json` is required. Native `tsc` cannot parse dialect source; use `twill check` and [standard declaration output](docs/libraries.md).

## Try it

The [playground](https://swiftuijs.github.io/twill/playground) runs the actual compiler locally, with live highlighting and generated-source inspection. It does not execute your code or type-check project imports.

For an application, download and extract the `twill-packages` artifact from a successful [CI build](https://github.com/swiftuijs/twill/actions/workflows/ci.yml). It includes the compiler/tooling tarballs, `twill.vsix` and a checksum manifest. The distributed compiler supports Node 20.19+ or 22.12+.

Install the compiler tarball as a development dependency in your application, then add the Vite adapter:

```sh
pnpm add -D /path/to/swiftuijs-twill-0.9.0.tgz
```

```ts
import { defineConfig } from 'vite';
import twill from '@swiftuijs/twill/vite';

export default defineConfig({ plugins: [twill()] });
```

Rename one module to `.twill`, update its imports, include it in your usual tsconfig and run:

```sh
pnpm exec twill check -p tsconfig.json
```

Install the extracted `twill.vsix` with VS Code's **Install from VSIX** command. Follow [getting started](docs/getting-started.md) for formatter/linter setup, and [framework development](docs/frameworks.md) for React Fast Refresh and Vue integration.

## A complete working loop

| Tool                 | What it provides                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Compiler and checker | Syntax lowering, original-source diagnostics, native TS types and generated declarations                   |
| VS Code extension    | Completion, signatures, hover, definitions, references, mixed-file rename, safe quick fixes and formatting |
| Formatter and linter | Independent Prettier and ESLint packages, including optional type-aware exhaustive linting                 |
| Build and execution  | Vite, Rollup, esbuild, webpack and Rspack adapters; an opt-in Node ESM loader                              |
| Debugging            | Source maps, generated-source viewer, project diagnostics and original-source Node breakpoints             |
| Migration            | Optional checked source export to formatted native TS/TSX                                                  |

React children, render props, Vue slots and component libraries use native framework contracts. There are no component registries or Twill-specific wrapping APIs; `@swiftuijs/ui` is one example consumer. Seven independent [examples](examples/README.md) cover ordinary workflows, mixed sources, cleanup, React, Vue and library output.

## Choosing it responsibly

Twill is a useful candidate for nullable workflows, owned resources, typed state handling and callback-heavy code. It is still an experimental dialect. Parser coverage follows a tested TS 5.9 contract; arbitrary workspace TS versions, general editor refactoring, native incremental `tsc --build`, a CommonJS Twill loader and every SSR framework are outside its current guarantees.

Representative native/dialect bundles are compared for behavior and byte size; release artifacts have enforced size budgets. Synthetic benchmarks do not establish whole-application speed or team productivity. Profile your actual workload and exercise failure paths. See [support](docs/readiness.md), [performance](docs/performance.md) and [gradual adoption](docs/adoption.md).

## Contributing

The repository is a pnpm workspace with Vite builds. See the [development guide](docs/contributing/tooling.md) for checkout, dependency and build commands. Compiler, formatter, linter and migration packages, editor packages, examples and the English documentation site own their code and tests.

```sh
pnpm check
pnpm editor:test          # requires a graphical host; use xvfb-run -a on headless Linux
pnpm test:browser        # requires Playwright Chromium
pnpm docs:dev
```

See [contributing](CONTRIBUTING.md), [architecture](docs/contributing/architecture.md), [language design](docs/language.md) and [release instructions](docs/contributing/releasing.md). MIT licensed.
