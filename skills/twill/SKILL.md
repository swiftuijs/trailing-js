---
name: twill
description: >-
  Write, review, debug and migrate Twill applications using Swift-inspired TypeScript
  syntax. Use for .twill/.twillx files, trailing closures, guard/defer/switch expressions,
  Twill build adapters, mixed TS/JS projects, and React/Vue integration.
license: MIT
metadata:
  release: 0.1.2
  website: https://twill.evecalm.com
  repository: https://github.com/swiftuijs/twill
---

# Develop applications with Twill

Twill extends TypeScript/TSX with Swift-inspired syntax and emits ordinary JavaScript. Use TypeScript's type system and existing JS libraries. This skill is for applications; contributing to the language repository follows its `AGENTS.md` and RFC process.

## Establish the project's contract

1. Read the application's instructions, manifest, lockfile, tsconfig and existing build/test setup. Check the installed `@swiftuijs/twill` version and keep Twill tooling packages on the same version. Metadata records this skill's released-language baseline, not a compiler installation.
2. Write dialect syntax in `.twill` (TS including JS) or `.twillx` (TSX). Native `.ts`, `.tsx`, `.js`, `.jsx` files retain native syntax. Change imports when renaming a module. Adopt an appropriate module, respecting the user's requested scope.
3. Use the published features below by default. Associated-value enums, `match` and external runtime helpers are documented source prototypes; `if const` and other RFC work also require checking actual implementation and availability. A proposal, PR, playground example or same-version local build does not prove npm support. Use a prototype only when the project deliberately uses a source build that implements it.
4. Use [syntax](https://twill.evecalm.com/syntax) and [compatibility](https://twill.evecalm.com/readiness) for detailed contracts. The parser targets documented TS 5.9 syntax; avoid claiming every TS program is compatible inside dialect files.

## Choose syntax that clarifies the task

### Callback pipelines

Use trailing closures when an ordinary API accepts a callback in that argument position. Earlier arguments remain inside parentheses. `in` separates an explicit parameter header; `(value: number) in` is a typed header. Multiple callbacks after the first require labels. Labels are erased and callbacks are appended in written order; they are not Swift argument labels.

```twill
const users = [
  { name: 'Ada', active: true },
  { name: 'Grace', active: false },
];
export const activeNames = users.filter {
  .active;
}.map {
  .name.toUpperCase();
};
export const doubled = [1, 2].map { value in
  value * 2;
};
```

A single expression returns implicitly by default. Multiple statements need an explicit `return`. With `implicitReturn: false`, even a single expression needs `return`. `.name` means member access on the first argument of that ordinary trailing closure; nested callbacks bind independently. Do not combine shorthand with an explicit header or use it outside eligible callbacks. `$0`, contextual enum shorthand and Swift `func`/`struct` syntax are not implemented.

Callbacks lower to arrows with lexical `this`. Keep ordinary `function` callbacks for APIs requiring a dynamic receiver. `fn() { ... }` is a trailing callback even across a newline; use `fn(); { ... }` for a separate block. Bare-name callbacks need the opening brace on the same line. Parenthesize an object return (`({ value: 42 })`) or a first-expression native `in` operator. Optional chaining, `??`, operators and async/await retain native contracts.

### Early exits and nullish bindings

Use `guard condition else { ... }` for a required exit on failure. Use `guard const` to evaluate a nullable result once and preserve valid falsy values such as zero, false and empty strings. Successful bindings remain in the surrounding scope.

```twill
export function label(input: { name?: string } | null): string {
  guard const { name = 'Anonymous' } = input else {
    return 'Missing';
  }
  return name;
}
```

The whole initializer is checked before native object/array destructuring. Defaults, getters, iterator closing, rest and nested pattern errors retain native behavior; this is not JSON or nested-shape validation. Pattern bindings have a temporal dead zone in the initializer/failure block. An identifier guard initializes its identifier before the failure block. Use one binding and brace the enclosing conditional/loop body.

The failure block must provably exit with `return`, `throw`, `break` or `continue`, or a supported block/if whose paths exit. A call typed `never`, a loop, switch or try does not establish this syntactic proof. Prefer ordinary `if (...)` when the branch should continue. Do not invent `if let` from Swift.

### Owned resources

Register `defer` immediately after acquiring ownership. Reached registrations run when that lexical block exits, in reverse order, including return/throw/loop exits. A branch owns its own cleanup; do not return a live resource that its block will close. Captures read live variables at cleanup time. Use explicit `await` for async cleanup and `return await` when pending work must finish before cleanup.

```twill
type Resource = { read(): Promise<string>; close(): Promise<void> };
export async function readOwned(acquire: () => Promise<Resource | null>): Promise<string> {
  guard const resource = await acquire() else {
    return 'Missing';
  }
  defer {
    await resource.close();
  }
  return await resource.read();
}
```

Every reached cleanup runs even if another cleanup fails; the last executed cleanup failure replaces an earlier/body failure. Synchronous cleanup does not await returned promises. Cleanup cannot jump out of its own defer block. For allocation-sensitive hot paths, consider native `try/finally`: defer callbacks and dynamic registration stacks have real costs.

### Exhaustive outcomes

Prefer ordinary TS discriminated unions for business outcomes. A switch expression produces one arm value and never falls through. Object arms use one common literal discriminator and native destructuring; each arm has its own binding scope. An arm contains one expression or `throw`, not a statement list.

```twill
type Outcome = { kind: 'ok'; value: number } | { kind: 'error'; message: string };
export function describe(outcome: Outcome): string {
  return switch (outcome) {
    case { kind: 'ok', value }: value.toFixed(2);
    case { kind: 'error', message }: message;
  };
}
```

Run `twill check` to prove exhaustiveness: transpile-only builds and the playground cannot prove union types. A default is a catch-all; it can conceal new variants. The optional typed linter can require explicit union cases even with a default. Unexpected unchecked values without a matching arm/default throw. Object discriminators can be read once for selection and again during destructuring; avoid side-effectful discriminator getters.

Native switch statements retain JS fallthrough. Direct `return switch (...)` emits a native scoped switch. Other expression positions in the release baseline use a synchronous lexical IIFE; `await`/`yield` inside a switch require direct return. Evaluate an awaited subject beforehand when necessary. Prefer the direct-return form in hot paths, inspect emitted output, and compare equivalent native work rather than assuming a speedup. See [performance](https://twill.evecalm.com/performance).

## Integrate with the existing toolchain

Install the compiler as a dev dependency using the project's package manager. Node requirements come from the installed package. `twill.config.json` is optional; default inline output needs no language runtime. Preserve existing configuration and create a config only to change supported options. The project tsconfig supplies strictness, types and JSX settings.

For ordinary Vite projects:

```ts
import { defineConfig } from 'vite';
import twill from '@swiftuijs/twill/vite';
export default defineConfig({ plugins: [twill()] });
```

For React with Vite 8 and React plugin 6, use `@swiftuijs/twill/vite-react`: `plugins: twillReact()`. It composes React Fast Refresh. Keep native hook rules and framework runtime dependencies. `.twillx` component closures emit JSX children; a single child is direct, general collection can allocate arrays. Own-scope `return` is forbidden in children collection; parameterized closures are render callbacks.

```twillx
import { useState } from 'react';
function Panel(props: { children?: import('react').ReactNode }) {
  return <section>{props.children}</section>;
}
export default function App() {
  const [count, setCount] = useState(0);
  return Panel {
    <button onClick={() => setCount(count + 1)}>Count: {count}</button>;
  };
}
```

For Vue JSX use the normal Twill adapter and `jsxImportSource: "vue"`. Component closures become lazy slots. Vue SFCs and framework SSR/HMR need their standard host integrations. Import component libraries normally; [SwiftUI.js](https://swiftuijs.evecalm.com/) is a sibling React library with its own setup, not a compiler dependency. See [frameworks](https://twill.evecalm.com/frameworks) and [build tools](https://twill.evecalm.com/build-tools).

Install `@swiftuijs/twill-formatter` with Prettier and configure its plugin. Install `@swiftuijs/twill-linter` with ESLint and use `recommended` or `recommendedTypeChecked` as appropriate; keep application globals and other config. Do not format dialect source as raw TypeScript. Native `tsc` cannot parse Twill: use the virtual checker, generated declarations for consumers, or checked native source export. See [tooling](https://twill.evecalm.com/tooling) and [libraries](https://twill.evecalm.com/libraries).

## Validate and debug the result

Run from the application root, adapting paths and package manager to the project:

```sh
pnpm exec twill check -p tsconfig.json
pnpm exec prettier --check src
pnpm exec eslint src
# Also run the application's relevant tests and production build.
```

Use the local package binaries and install missing tools before invoking them. A successful build does not replace type checking. Test nullish/falsy inputs, errors, cleanup order, async rejection and native boundary behavior relevant to the change. Measure performance-sensitive code against equivalent handwritten JS and include the generated output's allocations/scheduling in the comparison.

For supported Node ESM execution use `node --enable-source-maps --import @swiftuijs/twill/register src/main.twill`. The loader handles local mixed imports, not dependencies or arbitrary CommonJS transforms. For problems, inspect `twill doctor -p tsconfig.json --json`, original-source diagnostics and generated TS/TSX. The VS Code extension provides mapped completion/navigation/formatting and explicit debugging. The [playground](https://twill.evecalm.com/playground) lowers syntax locally but does not execute or check project types.

Report what changed, validation results, and any relevant unsupported integration or measured cost. Do not present an unrun check as passed or an unreleased feature as available to ordinary npm consumers.
