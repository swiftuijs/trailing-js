# Trailing: a JS/TS syntax-sugar language

Trailing is a dialect of JS/TS, rather than a new VM, type system or framework. `.tjs` and `.tts` distinguish extended source from standard source; `.tjsx` and `.ttsx` opt into JSX. The repository and package remain `trailing-js` / `@swiftuijs/trailing-js`. There is no migration to a speculative new suffix.

## Language principles

- JS/TS defines values, types, modules, exceptions, lexical scope and asynchronous execution. Existing standard syntax retains its semantics.
- New syntax has a documented lowering to ordinary JS/TS. Generated programs use existing engines, bundlers, package exports and framework APIs.
- No framework or component-library identity belongs in the parser. Builder behavior requires explicit configuration; runtime adapters are separate imports.
- The baseline language adds no runtime helpers. Features requiring allocations, closures, scheduling or resource stacks must disclose and measure their cost.
- Correct source positions, TS inference, editor support, strict diagnostics, cross-platform builds and published syntax contracts are part of a feature's implementation.

The compiler is a build dependency. Production bundles contain the lowered code and whatever normal runtime libraries the application imports. `transform()` preserves TypeScript; build plugins and the Node loader erase types and lower JSX. The type checker uses TypeScript 5.9, not a parallel type system. Unsupported syntax fails with a diagnostic; it is not guessed or silently discarded.

## Features borrowed from Swift

| Feature                                                    | Status                       | Lowering / decision                                                                                                                                               |
| ---------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trailing and multiple trailing closures                    | Implemented                  | Native arrow callbacks; labels supply positional argument order                                                                                                   |
| Single-expression closure return                           | Implemented                  | Ordinary `return`; multi-statement bodies retain JS rules                                                                                                         |
| `guard … else`                                             | Implemented in 0.2           | Negated `if` and an explicitly exiting failure branch                                                                                                             |
| Optional binding                                           | Implemented as `guard const` | `const` plus nullish check; TS narrows the binding                                                                                                                |
| Result builders                                            | Implemented, explicit opt-in | A local array and ordered pushes through control flow; applicable to data and UI                                                                                  |
| `defer`                                                    | Candidate                    | Must specify cleanup scope, registration order, async cleanup, exceptions and binding visibility; naive try/finally wrapping can alter lexical scope and hoisting |
| if/switch expressions                                      | Candidate                    | Prefer native branches and temporary bindings; an IIFE can allocate a closure and change await/return/this behavior                                               |
| `$0` / `$1` shorthand parameters                           | Candidate                    | Those names are already valid JS identifiers; opt-in and lexical binding rules are needed before introducing implicit parameters                                  |
| Named call arguments                                       | Candidate                    | JS calls are positional; TS parameter names and overloads are insufficient runtime contracts. Do not guess them from library signatures                           |
| Optional chaining, nullish fallback, async/await, generics | Use existing JS/TS           | Avoid duplicate syntax for capabilities already present                                                                                                           |
| SwiftUI state/property wrappers, observation               | Use normal framework APIs    | Hidden state insertion could violate React hooks or Vue tracking; adapters preserve the framework's lifecycle                                                     |
| Swift structs/value semantics, actors, ownership           | Outside baseline             | Would change the JS runtime model and need copying, scheduling or a separate semantic system                                                                      |

Candidates are not available syntax and are not version promises. Each requires a specification, interaction tests, native-code comparison, source mapping and performance evidence before adoption. In particular, cleanup remains ordinary `try/finally` in 0.2; the language does not silently introduce a cleanup stack.

## Ecosystem boundaries

Node and browser execution use normal emitted JavaScript. npm libraries do not need recompilation or awareness of Trailing. Callbacks can be used for data pipelines, event handlers, tasks, HTTP libraries or any function accepting an arrow callback. A trailing closure does not turn a non-callback API into a callback API. Arrow lexical `this` means APIs requiring a dynamically bound `this` still need ordinary `function` callbacks.

React components receive normal elements and children through the optional adapter; Vue receives normal lazy slots. JSX compilation currently targets React's automatic runtime. Vue SFC/JSX, custom JSX runtimes and React Fast Refresh need separate integrations; framework independence does not imply automatic support for every source format or development transform.

The CLI provides a virtual-project checker and single-file source generation. Native `tsc` cannot parse dialect source, and the checker does not emit declarations or build project references. Library distribution can use a normal TS generation/build pipeline, but repository-wide source generation and declaration packaging are still future tooling work. Formatting, rename and auto-import editing also remain incomplete. Packaging and CI are production-oriented; the language itself is experimental and should not be presented as a mature replacement for TypeScript.
