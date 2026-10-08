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
3. Use the published features below by default. Associated-value enums, `match`, branch-local `if const`, external runtime helpers and the optional shell SDK are documented source prototypes. A proposal, PR, playground example or same-version local build does not prove npm support. Use a prototype only when the project deliberately uses a source build that implements it; verify actual implementation before using other RFC work.
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

**Source-only branch bindings (unreleased):** For a deliberate source build implementing RFC 0018, `if const value = expression { ... } else { ... }` evaluates once and binds a non-nullish immutable value only in the success block. Initializer, else and following references resolve in the outer scope, including an outer variable with the same name. Object/array destructuring runs only after the whole value passes the strict null/undefined check; defaults, getters, iterators, rest and nested errors keep native behavior. One binding and a braced success body are required; else is optional. Multiple bindings, while bindings and if expressions are not implemented. npm/Marketplace 0.1.2 do not include this feature.

The outer initializer's next brace starts the branch. Group a trailing-call initializer: `if const user = (find(id) { candidate in candidate.active }) { use(user); }`. Await/yield, rejection, return, loop exits and branch-local defer keep their enclosing ownership. Ordinary initializers emit a hygienic temporary and native scoped const/if without adding a helper, closure, promise or runtime import. An initializer using `match` retains that expression's existing lowering costs and suspension restrictions. Use `guard const` when the successful binding must remain after the statement.

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

For other bundlers use the matching published entry: `@swiftuijs/twill/rollup`, `/webpack`, `/rspack` or `/esbuild`. The checkout tests Vite 8, Rollup 4, Webpack 5, Rspack 2 and esbuild 0.28. Vite/esbuild own native TS/JSX emission; the other adapters emit local native TS/TSX/JSX by default. Set `nativeSources: false` when another plugin/loader already owns it. Keep aliases, dependency handling and framework HMR in the host. Use the host's watch API; esbuild uses `context().watch()` or `.rebuild()`, with `.dispose()` on exit.

**Source-only watch fix (unreleased):** Configuration refresh on each build, inherited JSX dependency invalidation and optional config creation/deletion are covered by real host tests in this checkout. npm 0.1.2 has the adapters but requires a host restart after configuration changes. Do not assume incremental output preserves framework state or performs type checking. For Rollup editors using atomic saves on Linux, the host's native watcher can miss repeat replacements; use `watch.chokidar.usePolling: true` if affected. See the [development matrix](https://twill.evecalm.com/build-tools#adapter-support).

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

**Source-only shell SDK (unreleased):** `@swiftuijs/twill-shell` is an optional Node production dependency, not part of npm 0.1.2 or compiler output. Only use it when the project deliberately installs the source prototype. Its execution backend calls native `spawn` / libuv directly with literal argv and `shell: false`; commands do not translate to TS or require a compiler at runtime. `Command.path` requires an absolute path; `Command.name` uses native PATH search. Prefer trusted paths and the executable's `--` separator where supported for user filenames. Stdin defaults to EOF; output/error inherit. Text/byte capture via `Output.text({limit})` / `.bytes({limit})` needs explicit byte bounds; preserve byte input storage until completion. Child `cwd` and `Environment.inherit` / `.replace` never change parent globals. Nonzero exits reject unless `check: false`; I/O, launch, cancellation, timeout and overflow still reject. Pass `signal`/`timeoutMs`, inspect `cleanupErrors` and any `unresolvedProcessIdentifier`, and avoid automatically logging captured secrets. Ownership covers the direct child, not descendants. Ordinary `guard`, trailing closures and `defer` can organize scripts; respect cleanup ownership and use normal TS status unions/error guards. Native export retains the SDK import and runs without the loader. The source-only compiler runner supports `twill script.twill [args...]`, `twill run script.twill [args...]` and POSIX `#!/usr/bin/env twill` scripts with executable permission and the binary on PATH (`pnpm exec ./script.twill` supplies a local binary). The runner is not part of published 0.1.2. The source-only startup prototype caches successful module compilation across fresh launches, validating actual source/configuration and compiler/dependency contents. Set `TWILL_CACHE=0` to disable it; `TWILL_CACHE_DIR` selects an absolute private directory (default `~/.twill/script-cache-v1`). Entries include original source maps: disable caching for sensitive source, use trusted private directories, and clear that directory to reset it. Completed slots are bounded to 64 MiB; large modules/collisions/corrupt entries/unavailable locations compile normally. Windows privacy relies on inherited user-profile ACLs. Advanced Node registration remains uncached by default. Rust backends are proposed, not implemented. Arguments after the file are forwarded literally; use `run -- <file>` for dash-prefixed names. It preserves native cwd/environment/I/O, argv shape, exit codes and signals in the same Node process, with source maps enabled and no automatic type checking or package installation. Dependencies resolve from the script location; extensionless entry scripts are supported. The runner imports the entry, so Node main-module detection (`import.meta.main` / `require.main === module`) does not select it; put executable code in a dedicated entry and reusable functions in imported modules. Scoped streams, pipelines and shell templates are not implemented. See [shell scripting](https://twill.evecalm.com/scripting) for the tested API, example and performance boundaries.

Report what changed, validation results, and any relevant unsupported integration or measured cost. Do not present an unrun check as passed or an unreleased feature as available to ordinary npm consumers.
