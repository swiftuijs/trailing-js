# Twill: a JS/TS syntax-sugar language

Twill is a dialect of JS/TS using existing engines and TypeScript's type system. Install `@swiftuijs/twill` as a development dependency; the CLI is `twill`. `.twill` / `.twillx` use TypeScript / TSX, including JavaScript syntax with optional types. Native JS remains a native source format.

## Language principles

- JS/TS defines values, types, modules, exceptions, lexical scope and asynchronous execution. Existing standard syntax retains its semantics.
- New syntax has a documented lowering to ordinary JS/TS. Generated programs use existing engines, bundlers, package exports and framework APIs.
- Component closures in `.twillx` follow JSX’s uppercase naming convention and compile to native JSX. No component libraries or registries belong in the parser; the standard JSX runtime selects framework behavior. Ordinary `.twill` callbacks retain function semantics.
- Ordinary trailing closures and guards add no runtime helpers. Features requiring allocations, closures, scheduling or resource stacks must disclose and measure their cost.
- New contextual statements preserve existing JS identifier uses. `defer { ... }` requires a same-line brace; `defer()`, properties, assignments and labels are ordinary JS. Existing JS keywords keep their meanings.
- Correct source positions, TS inference, editor support, strict diagnostics, cross-platform builds and published syntax contracts are part of a feature's implementation.
- Prefer explicit validation, resource ownership and business outcomes. Existing TS types and normal libraries are the first choice when they express the same intent without new syntax.

The compiler is a build dependency. Production bundles contain the lowered code and whatever normal runtime libraries the application imports. `transform()` preserves TypeScript; build plugins and the Node loader erase types and lower JSX. The type checker uses TypeScript 5.9, not a parallel type system. Unsupported syntax fails with a diagnostic; it is not guessed or silently discarded.

## Features borrowed from Swift

| Feature                                                    | Status                                                | Lowering / decision                                                                                                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trailing and multiple trailing closures                    | Implemented                                           | Native arrow callbacks; labels supply positional argument order                                                                                                 |
| Single-expression closure return                           | Implemented                                           | Ordinary `return`; multi-statement bodies retain JS rules                                                                                                       |
| `guard … else`                                             | Supported                                             | Negated `if` and an explicitly exiting failure branch                                                                                                           |
| Optional binding                                           | Implemented as `guard const`                          | `const` plus nullish check; identifier and nested/rest/default destructuring bindings                                                                           |
| UI child collection                                        | Implemented in `.twillx`                              | A local array and ordered pushes through control flow; inside natural component closures                                                                        |
| `defer`                                                    | Supported                                             | One callback or a lazy stack with finally; reverse cleanup order, explicit async await, all cleanups run, lexical captures and function-body hoisting preserved |
| Optional chaining, nullish fallback, async/await, generics | Use existing JS/TS                                    | Avoid duplicate syntax for capabilities already present                                                                                                         |
| Associated-value enums and immutable data                  | Use existing TS                                       | Discriminated unions and readonly types; no wrapper runtime, hidden freezing or value copying                                                                   |
| Switch expressions and object patterns                     | Implemented                                           | Native switches over TS discriminated unions; direct returns avoid an extra function, other expression positions use a synchronous IIFE                         |
| Exhaustive switches                                        | Checker for expressions; optional lint for statements | `twill check` proves expression exhaustiveness; `recommendedTypeChecked` also checks native switches and missing variants even with `default`                   |
| SwiftUI state/property wrappers, observation               | Use normal framework APIs                             | Hidden state insertion could violate React hooks or Vue tracking; native JSX preserves the framework's lifecycle                                                |
| Swift structs/value semantics, actors, ownership           | Outside baseline                                      | Would change the JS runtime model and need copying, scheduling or a separate semantic system                                                                    |

`defer` allocates a cleanup closure for each reached registration. Multiple or control-flow registrations additionally allocate a lazy local stack. Native `try/finally` remains available for allocation-sensitive loops.

See [practical patterns](./patterns.md) for boundary validation, explicit results, owned cleanup and cooperative cancellation in ordinary application code.

## Ecosystem boundaries

Node and browser execution use normal emitted JavaScript. npm libraries do not need recompilation or awareness of Twill. Callbacks can be used for data pipelines, event handlers, tasks, HTTP libraries or any function accepting an arrow callback. A trailing closure does not turn a non-callback API into a callback API. Arrow lexical `this` means APIs requiring a dynamically bound `this` still need ordinary `function` callbacks.

React component closures compile to normal JSX elements and children; Vue closures become lazy slots, including named slots. The standard JSX runtime setting selects React, Vue or another automatic JSX runtime. Vue SFC and React Fast Refresh still need their host integrations; support for component libraries does not imply support for every source format or development transform.

Native TS/JS and Twill share module graphs through the build integrations, virtual checker, Node ESM loader and TS-server editor bridge. The CLI provides a virtual-project checker and single-file source generation. Native `tsc` cannot parse dialect source, and `twill declarations` is used to emit standard library declarations and `--build` to visit references. Vite emits library JS; native `tsc --build` cannot parse Twill directly. The VSIX supports safe rename, auto-imports, import organization and mapped quick fixes. Formatter and linter plugins install as independent packages; general refactoring remains incomplete. Twill is experimental; review [supported workflows](./readiness.md) and pilot it in your application before a production commitment.
