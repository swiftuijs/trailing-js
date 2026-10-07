# <img src="https://twill.evecalm.com/logo.png" alt="Twill hummingbird" align="right" width="40" height="40" /> Twill

**TypeScript. Clearer flow.**

Twill is a **TypeScript-based language with Swift-inspired syntax extensions**, built by [forth.ink](https://forth.ink). It extends TypeScript and TSX with guards, `defer`, trailing closures and checked switch expressions. Use TypeScript's type system and existing JavaScript libraries; compile to ordinary JavaScript.

[Documentation](https://twill.evecalm.com/) · [Why Twill?](https://twill.evecalm.com/why-twill) · [Playground](https://twill.evecalm.com/playground) · [Getting started](https://twill.evecalm.com/getting-started) · [VS Code extension](https://marketplace.visualstudio.com/items?itemName=forth-ink.twill) · [Compatibility](https://twill.evecalm.com/readiness)

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

**Release line:** 0.1. Twill is an experimental language with a tested compiler, editor and build workflow. Start with one module and evaluate it against your application’s requirements. See [support and compatibility](https://twill.evecalm.com/readiness).

## Why use Twill?

- **Make early exits explicit.** `guard … else` requires an exiting failure path. `guard const` evaluates once, preserves zero and false, and keeps native TS narrowing.
- **Keep cleanup beside ownership.** Register `defer` immediately after acquisition; reached registrations run on scope exit in reverse order, including failures.
- **Catch omitted business states.** Match ordinary TS discriminated unions and bind their payloads. `twill check` verifies expression exhaustiveness when a variant is added.
- **Keep callbacks and composition readable.** Trailing closures work with normal callback APIs. In UI files, component closures become native JSX children or lazy Vue slots.
- **Adopt one module at a time.** Two-way TS/JS imports, standard framework APIs, generated declarations and optional native source export keep the integration incremental.

TypeScript already expresses these behaviors with branches, `try/finally`, arrows and unions. Twill supplies a more explicit syntax for recurring tasks; it earns its place when review clarity outweighs an additional compiler integration. Read the [code comparisons and tradeoffs](https://twill.evecalm.com/why-twill).

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

Ordinary closures become arrows; guards become branches. Direct-return switch expressions become native switches. The unreleased prototype also removes the IIFE from standalone identifier initializers; other expression contexts retain it. Inline emission introduces no runtime library. `defer` allocates callbacks and dynamic registrations use a local stack; general component child collection uses arrays. These costs are [documented and measured](https://twill.evecalm.com/performance).

| File                         | Use                                                         |
| ---------------------------- | ----------------------------------------------------------- |
| `.twill`                     | TypeScript, including JavaScript syntax with optional types |
| `.twillx`                    | TSX, native JSX and component closures                      |
| `.ts`, `.tsx`, `.js`, `.jsx` | Ordinary source files, retaining their native syntax        |

The current parser targets documented TypeScript 5.9 syntax; it does not claim support for every valid TypeScript program. Trailing closures also introduce [syntax ambiguity rules](https://twill.evecalm.com/syntax#ambiguities-and-semicolons). Native TS/JS files keep their usual parsing.

Twill and native files can import each other through the build adapters, virtual checker and Node ESM loader. Your normal `tsconfig.json` supplies types and JSX settings. No `twill.config.json` is required. Native `tsc` cannot parse dialect source; use `twill check` and [standard declaration output](https://twill.evecalm.com/libraries).

## Try it

The [playground](https://twill.evecalm.com/playground) runs the actual compiler locally, with live highlighting and generated-source inspection. It does not execute your code or type-check project imports.

Install the compiler as a development dependency in your application. It supports Node 20.19+ or 22.12+. Default inline emission introduces no language runtime dependency into your application bundle. The unreleased [optional runtime](https://twill.evecalm.com/runtime) prototype shares dynamic synchronous cleanup when explicitly selected.

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

Follow [getting started](https://twill.evecalm.com/getting-started) to complete the editor, formatter and linter setup. For React, use the [React Vite adapter](https://twill.evecalm.com/frameworks#react-with-vite-8) to keep Fast Refresh working.

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

React children, render props, Vue slots and component libraries use native framework contracts. There are no component registries or Twill-specific wrapping APIs.

[SwiftUI.js](https://swiftuijs.evecalm.com/) (`@swiftuijs/ui`) is our sibling project: a SwiftUI-inspired React component library. Its components work with Twill's native JSX output. Its website covers installation and styles; see its [source repository](https://github.com/swiftuijs/ui) for the components.

Independent [examples](https://github.com/swiftuijs/twill/blob/main/examples/README.md) cover ordinary workflows, mixed sources, cleanup, React, Vue and library output. The [React framework source study](https://twill.evecalm.com/react-source) also compares a pinned client-core rewrite with native JavaScript.

## Packages

Install only the tools your project needs. Keep Twill packages on the same release version.

| Package                                                                                  | Purpose                                                        |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`@swiftuijs/twill`](https://www.npmjs.com/package/@swiftuijs/twill)                     | Compiler, `twill` CLI, checker, build adapters and Node loader |
| [`@swiftuijs/twill-formatter`](https://www.npmjs.com/package/@swiftuijs/twill-formatter) | Prettier plugin and browser-compatible formatting API          |
| [`@swiftuijs/twill-linter`](https://www.npmjs.com/package/@swiftuijs/twill-linter)       | ESLint flat configurations and source-mapped fixes             |
| [`@swiftuijs/twill-export`](https://www.npmjs.com/package/@swiftuijs/twill-export)       | Optional `twill export` command for native TS/TSX output       |
| [`@swiftuijs/twill-highlight`](https://www.npmjs.com/package/@swiftuijs/twill-highlight) | Browser/SSR Shiki integration and TextMate grammars            |
| `@swiftuijs/twill-runtime` (unreleased prototype)                                        | Optional, versioned synchronous cleanup helpers                |

Install the [Twill VS Code extension](https://marketplace.visualstudio.com/items?itemName=forth-ink.twill) from Marketplace, or run `code --install-extension forth-ink.twill`. The extension bundles its editing tools. Your application installs the compiler for builds and whole-project checks. See the [editor guide](https://twill.evecalm.com/tooling) for configuration.

## Choosing it responsibly

Twill is a useful candidate for nullable workflows, owned resources, typed state handling and callback-heavy code. It is still an experimental dialect. Parser coverage follows a tested TS 5.9 contract; arbitrary workspace TS versions, general editor refactoring, native incremental `tsc --build`, a CommonJS Twill loader and every SSR framework are outside its current guarantees.

Representative native/dialect bundles are compared for behavior and byte size; release artifacts have enforced size budgets. Synthetic benchmarks do not establish whole-application speed or team productivity. Profile your actual workload and exercise failure paths. See [compatibility](https://twill.evecalm.com/readiness), [performance](https://twill.evecalm.com/performance) and [gradual adoption](https://twill.evecalm.com/adoption).

## Contributing

The repository is a pnpm workspace with Vite builds. See the [development guide](https://github.com/swiftuijs/twill/blob/main/docs/contributing/tooling.md) for checkout, dependency and build commands. Compiler, formatter, linter, export, highlight and optional runtime packages, editor packages, examples and the English documentation site own their code and tests.

```sh
pnpm check
pnpm editor:test          # requires a graphical host; use xvfb-run -a on headless Linux
pnpm test:browser        # requires Playwright Chromium
pnpm docs:dev
```

See [contributing](https://github.com/swiftuijs/twill/blob/main/CONTRIBUTING.md), [architecture](https://github.com/swiftuijs/twill/blob/main/docs/contributing/architecture.md), [language design](https://twill.evecalm.com/language) and [release instructions](https://github.com/swiftuijs/twill/blob/main/docs/contributing/releasing.md). MIT licensed.

## Unreleased language work

The RFC 0018 source prototype adds `if const value = lookup() { use(value); }` with branch-local nullish bindings and native destructuring. Group trailing calls in initializers, following Swift’s condition boundary. It emits native branches without a helper, closure or optional wrapper. This is unreleased; see [syntax](https://twill.evecalm.com/syntax#branch-nullish-bindings-unreleased) and [RFC 0018](https://github.com/swiftuijs/twill/blob/main/docs/rfcs/0018-optional-branch-bindings.md).

Unreleased source work includes associated-value enums and accepted `match` expressions: `match (state) { case State.loaded({ value }): value; default: 0; }`. Named payload bindings and erased factory descriptors compile to native switches without calling factories. Native switch statements retain JS fallthrough; match and switch expressions return one result without fallthrough. These additions are not included in npm/Marketplace 0.1.2. Compiler, formatter, linter, highlighter, export and editor changes are validated together. See [syntax and compatibility](https://twill.evecalm.com/syntax#match-expressions-unreleased) and [RFC 0016](https://github.com/swiftuijs/twill/blob/main/docs/rfcs/0016-pattern-matching.md).
