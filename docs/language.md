# Twill: a JS/TS syntax-sugar language

Twill is a dialect of JS/TS using existing engines and TypeScript's type system. The repository is `swiftuijs/twill`, the package is `@swiftuijs/twill`, and the CLI is `twill`. `.twill` / `.twillx` use TypeScript / TSX, including JavaScript syntax with optional types. Native JS remains a native source format. The pre-publication rename is complete; earlier names and suffixes have no compatibility aliases.

## Language principles

- JS/TS defines values, types, modules, exceptions, lexical scope and asynchronous execution. Existing standard syntax retains its semantics.
- New syntax has a documented lowering to ordinary JS/TS. Generated programs use existing engines, bundlers, package exports and framework APIs.
- Component closures in `.twillx` follow JSX’s uppercase naming convention and compile to native JSX. No component libraries or registries belong in the parser; the standard JSX runtime selects framework behavior. Ordinary `.twill` callbacks retain function semantics.
- Ordinary trailing closures and guards add no runtime helpers. Features requiring allocations, closures, scheduling or resource stacks must disclose and measure their cost.
- New contextual statements preserve existing JS identifier uses. `defer { ... }` requires a same-line brace; `defer()`, properties, assignments and labels are ordinary JS. Existing JS keywords keep their meanings.
- Correct source positions, TS inference, editor support, strict diagnostics, cross-platform builds and published syntax contracts are part of a feature's implementation.

The compiler is a build dependency. Production bundles contain the lowered code and whatever normal runtime libraries the application imports. `transform()` preserves TypeScript; build plugins and the Node loader erase types and lower JSX. The type checker uses TypeScript 5.9, not a parallel type system. Unsupported syntax fails with a diagnostic; it is not guessed or silently discarded.

## Features borrowed from Swift

| Feature                                                    | Status                       | Lowering / decision                                                                                                                                               |
| ---------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trailing and multiple trailing closures                    | Implemented                  | Native arrow callbacks; labels supply positional argument order                                                                                                   |
| Single-expression closure return                           | Implemented                  | Ordinary `return`; multi-statement bodies retain JS rules                                                                                                         |
| `guard … else`                                             | Implemented in 0.2           | Negated `if` and an explicitly exiting failure branch                                                                                                             |
| Optional binding                                           | Implemented as `guard const` | `const` plus nullish check; TS narrows the binding                                                                                                                |
| UI child collection                                        | Implemented in `.twillx`     | A local array and ordered pushes through control flow; inside natural component closures                                                                          |
| `defer`                                                    | Implemented in 0.3           | Block-local lazy callback stack and finally; reverse cleanup order, explicit async await, all cleanups run, lexical captures and function-body hoisting preserved |
| if/switch expressions                                      | Candidate                    | Prefer native branches and temporary bindings; an IIFE can allocate a closure and change await/return/this behavior                                               |
| `$0` / `$1` shorthand parameters                           | Candidate                    | Those names are already valid JS identifiers; opt-in and lexical binding rules are needed before introducing implicit parameters                                  |
| Named call arguments                                       | Candidate                    | JS calls are positional; TS parameter names and overloads are insufficient runtime contracts. Do not guess them from library signatures                           |
| Optional chaining, nullish fallback, async/await, generics | Use existing JS/TS           | Avoid duplicate syntax for capabilities already present                                                                                                           |
| SwiftUI state/property wrappers, observation               | Use normal framework APIs    | Hidden state insertion could violate React hooks or Vue tracking; native JSX preserves the framework's lifecycle                                                  |
| Swift structs/value semantics, actors, ownership           | Outside baseline             | Would change the JS runtime model and need copying, scheduling or a separate semantic system                                                                      |

Candidates are not available syntax and are not version promises. Each requires a specification, interaction tests, native-code comparison, source mapping and performance evidence before adoption. `defer` intentionally incurs local stack and closure allocations; native `try/finally` remains available for simple cleanup or allocation-sensitive loops.

## Ecosystem boundaries

Node and browser execution use normal emitted JavaScript. npm libraries do not need recompilation or awareness of Twill. Callbacks can be used for data pipelines, event handlers, tasks, HTTP libraries or any function accepting an arrow callback. A trailing closure does not turn a non-callback API into a callback API. Arrow lexical `this` means APIs requiring a dynamically bound `this` still need ordinary `function` callbacks.

React component closures compile to normal JSX elements and children; Vue closures become lazy slots, including named slots. The standard JSX runtime setting selects React, Vue or another automatic JSX runtime. Vue SFC and React Fast Refresh still need their host integrations; support for component libraries does not imply support for every source format or development transform.

Native TS/JS and Twill share module graphs through the build integrations, virtual checker, Node ESM loader and TS-server editor bridge. The CLI provides a virtual-project checker and single-file source generation. Native `tsc` cannot parse dialect source, and the checker does not emit declarations or build project references. Library distribution can use a normal TS generation/build pipeline, but repository-wide source generation and declaration packaging are still future tooling work. Formatting, rename and auto-import editing also remain incomplete. Packaging and CI are production-oriented; the language itself is experimental and should not be presented as a mature replacement for TypeScript.
