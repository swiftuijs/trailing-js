# Twill

**Clearer flow. Same TypeScript.**

Twill is a small syntax-sugar language for JavaScript and TypeScript, built by [forth.ink](https://forth.ink). Make validation, cleanup and business states explicit with guards, `defer`, trailing closures and checked switch expressions. Compile to ordinary JavaScript, keep TS types and mix Twill with your existing code.

[Documentation](https://swiftuijs.github.io/twill/) · [Why Twill?](https://swiftuijs.github.io/twill/why-twill) · [Playground](https://swiftuijs.github.io/twill/playground) · [Getting started](https://swiftuijs.github.io/twill/getting-started) · [Support](https://swiftuijs.github.io/twill/readiness)

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

**Release line:** 0.1. Twill is an experimental language with a tested compiler, editor and build workflow. Start with one module and evaluate it against your application’s requirements. See [support and compatibility](https://swiftuijs.github.io/twill/readiness).

## Why use Twill?

- **Make early exits explicit.** `guard … else` requires an exiting failure path. `guard const` evaluates once, preserves zero and false, and keeps native TS narrowing.
- **Keep cleanup beside ownership.** Register `defer` immediately after acquisition; reached registrations run on scope exit in reverse order, including failures.
- **Catch omitted business states.** Match ordinary TS discriminated unions and bind their payloads. `twill check` verifies expression exhaustiveness when a variant is added.
- **Keep callbacks and composition readable.** Trailing closures work with normal callback APIs. In UI files, component closures become native JSX children or lazy Vue slots.
- **Adopt one module at a time.** Two-way TS/JS imports, standard framework APIs, generated declarations and optional native source export keep the integration incremental.

TypeScript already expresses these behaviors with branches, `try/finally`, arrows and unions. Twill supplies a more explicit syntax for recurring tasks; it earns its place when review clarity outweighs an additional compiler integration. Read the [code comparisons and tradeoffs](https://swiftuijs.github.io/twill/why-twill).

## Small syntax, existing semantics

```twill
const names = users.filter {
  .active;
}.map {
  .name;
};

type Outcome = { kind: 'ok'; value: number } | { kind: 'error'; message: string };
function describe(outcome: Outcome): string {
  return switch (outcome) {
    case { kind: 'ok', value }: value.toFixed(2);
    case { kind: 'error', message }: message;
  };
}
```

Ordinary closures become arrows; guards become branches. Direct-return switch expressions become native switches; other expression positions use an IIFE. No language runtime library is introduced. `defer` allocates callbacks and dynamic registrations use a local stack; general component child collection uses arrays. These costs are [documented and measured](https://swiftuijs.github.io/twill/performance).

| File                         | Use                                                         |
| ---------------------------- | ----------------------------------------------------------- |
| `.twill`                     | TypeScript, including JavaScript syntax with optional types |
| `.twillx`                    | TSX, native JSX and component closures                      |
| `.ts`, `.tsx`, `.js`, `.jsx` | Ordinary source files, retaining their native syntax        |

Twill and native files can import each other through the build adapters, virtual checker and Node ESM loader. Your normal `tsconfig.json` supplies types and JSX settings. No `twill.config.json` is required. Native `tsc` cannot parse dialect source; use `twill check` and [standard declaration output](https://swiftuijs.github.io/twill/libraries).

## Try it

The [playground](https://swiftuijs.github.io/twill/playground) runs the actual compiler locally, with live highlighting and generated-source inspection. It does not execute your code or type-check project imports.

Install the compiler as a development dependency in your application. It supports Node 20.19+ or 22.12+ and introduces no language runtime dependency into your application bundle.

```sh
pnpm add -D @swiftuijs/twill
# npm install --save-dev @swiftuijs/twill
```

Add the Vite adapter to your existing configuration:

```ts
import { defineConfig } from 'vite';
import twill from '@swiftuijs/twill/vite';

export default defineConfig({ plugins: [twill()] });
```

Rename one module to `.twill`, update its imports, include it in your usual tsconfig and run:

```sh
pnpm exec twill check -p tsconfig.json
```

Follow [getting started](https://swiftuijs.github.io/twill/getting-started) to complete the editor, formatter and linter setup. For React, use the [React Vite adapter](https://swiftuijs.github.io/twill/frameworks#react-with-vite-8) to keep Fast Refresh working.

## A complete working loop

| Tool                 | What it provides                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| Compiler and checker | Syntax lowering, original-source diagnostics, native TS types and generated declarations                   |
| VS Code extension    | Completion, signatures, hover, definitions, references, mixed-file rename, safe quick fixes and formatting |
| Formatter and linter | Independent Prettier and ESLint packages, including optional type-aware exhaustive linting                 |
| Build and execution  | Vite, Rollup, esbuild, webpack and Rspack adapters; an opt-in Node ESM loader                              |
| Debugging            | Source maps, generated-source viewer, project diagnostics and original-source Node breakpoints             |
| Web highlighting     | `@swiftuijs/twill-highlight`: browser/SSR Shiki integration and portable TextMate grammars                 |
| Source export        | `twill export`: optional checked source export to formatted native TS/TSX                                  |

React children, render props, Vue slots and component libraries use native framework contracts. There are no component registries or Twill-specific wrapping APIs; `@swiftuijs/ui` is one example consumer. Independent [examples](https://github.com/swiftuijs/twill/blob/main/examples/README.md) cover ordinary workflows, mixed sources, cleanup, React, Vue and library output. The [React framework source study](https://swiftuijs.github.io/twill/react-source) also compares a pinned client-core rewrite with native JavaScript.

## Packages

Install only the tools your project needs. Keep Twill packages on the same release version.

| Package                                                                                  | Purpose                                                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`@swiftuijs/twill`](https://www.npmjs.com/package/@swiftuijs/twill)                     | Compiler, `twill` CLI, checker, build adapters and Node loader |
| [`@swiftuijs/twill-formatter`](https://www.npmjs.com/package/@swiftuijs/twill-formatter) | Prettier plugin and browser-compatible formatting API          |
| [`@swiftuijs/twill-linter`](https://www.npmjs.com/package/@swiftuijs/twill-linter)       | ESLint flat configurations and source-mapped fixes             |
| [`@swiftuijs/twill-export`](https://www.npmjs.com/package/@swiftuijs/twill-export)       | Optional `twill export` command for native TS/TSX output       |
| [`@swiftuijs/twill-highlight`](https://www.npmjs.com/package/@swiftuijs/twill-highlight) | Browser/SSR Shiki integration and TextMate grammars            |

The VS Code extension bundles its editing tools. Your application installs the compiler for builds and whole-project checks. See the [editor guide](https://swiftuijs.github.io/twill/tooling) for installation.

## Choosing it responsibly

Twill is a useful candidate for nullable workflows, owned resources, typed state handling and callback-heavy code. It is still an experimental dialect. Parser coverage follows a tested TS 5.9 contract; arbitrary workspace TS versions, general editor refactoring, native incremental `tsc --build`, a CommonJS Twill loader and every SSR framework are outside its current guarantees.

Representative native/dialect bundles are compared for behavior and byte size; release artifacts have enforced size budgets. Synthetic benchmarks do not establish whole-application speed or team productivity. Profile your actual workload and exercise failure paths. See [support](https://swiftuijs.github.io/twill/readiness), [performance](https://swiftuijs.github.io/twill/performance) and [gradual adoption](https://swiftuijs.github.io/twill/adoption).

## Contributing

The repository is a pnpm workspace with Vite builds. See the [development guide](https://github.com/swiftuijs/twill/blob/main/docs/contributing/tooling.md) for checkout, dependency and build commands. Compiler, formatter, linter, export and highlight packages, editor packages, examples and the English documentation site own their code and tests.

```sh
pnpm check
pnpm editor:test          # requires a graphical host; use xvfb-run -a on headless Linux
pnpm test:browser        # requires Playwright Chromium
pnpm docs:dev
```

See [contributing](https://github.com/swiftuijs/twill/blob/main/CONTRIBUTING.md), [architecture](https://github.com/swiftuijs/twill/blob/main/docs/contributing/architecture.md), [language design](https://swiftuijs.github.io/twill/language) and [release instructions](https://github.com/swiftuijs/twill/blob/main/docs/contributing/releasing.md). MIT licensed.
