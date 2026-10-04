# Language syntax contract (0.2)

The extension adds a trailing closure to an identifier, a member expression, or a call expression. The closure becomes the call's final argument. Parenthesized callable results, such as `(factory()) { ... }`, invoke the result. Calls can chain after the closure: `items.map() { x in x * 2 }.filter(Boolean)`.

```text
call { statements }
call { parameters in statements }
call { async parameters in statements }
call { statements } label: { statements } another: { statements }
```

Use parentheses for typed parameters, destructuring, defaults, rest parameters, or a return annotation: `{ (value: number): string in String(value) }`. Bare names also work: `{ value, index in value + index }`. `async` is a modifier when followed by parameters; `{ async in async }` has a parameter named `async`.

One expression statement implicitly returns its value. Multiple statements have ordinary arrow-body semantics and require an explicit return. Set `implicitReturn: false` to disable the extension's implicit return. `$0`, Swift parameter labels at the call site, captures, `throws`, Swift types, `defer`, and if/switch expressions are not part of this language.

Subsequent closures require labels. Labels lower to positional callbacks, without reflection on TypeScript signatures or parameter names. Labels need not match a function's parameter names. `new Constructor { ... }` and trailing closures on tagged template expressions are not supported; write an ordinary callback or explicitly call the returned function.

## Ambiguities and semicolons

`fn() { ... }` is extension syntax, even across a newline. Write `fn(); { ... }` for a separate block. Bare names or member expressions followed by a brace on another line remain separate statements; keep `run { ... }` on one line or write `run()\n{ ... }`.

Inside a header, the first top-level `in` separates parameters from the body. To evaluate JavaScript's `in` operator as the first expression, parenthesize it: `run() { ('key' in object) }`. Single object expressions also need parentheses, as in an ordinary arrow: `run() { ({ value: 42 }) }`.

Standard `if (check()) { ... }`, loop bodies, functions, classes, methods, object literals, and labeled blocks are unchanged. `.ts` / `.js` files are never opted into this dialect by the default build plugin.

## Guards

```text
guard expression else { exiting statements }
guard const identifier = expression else { exiting statements }
```

A condition becomes `if (!(expression))`. A binding becomes `const identifier = expression; if (identifier == null)`. The binding is in the surrounding JS lexical scope, evaluates its initializer once, retains falsy values, and supports ordinary TS type annotations. Only one identifier can be bound; destructuring and multiple declarations are rejected. A binding used as an unbraced conditional/loop body is rejected; add braces. Bindings retain their surrounding scope; no callback, exception wrapper or runtime dependency is introduced.

The failure block must provably exit: a direct `return`, `throw`, `break`, or `continue`; a nested block with an exit; or an `if` with exits in both branches. Exit inference is deliberately conservative: calls (even TS `never` functions), loops, switch statements and try statements do not prove an exit in 0.2. Existing JS rules still determine whether a return or labeled break/continue is legal. Each guard inside a failure branch is checked independently. In an explicit builder, own-scope `return` remains forbidden; `throw` and loop exits are available. A condition guard used as a single unbraced body lowers inside braces so an outer `else` retains its original association.

`guard` is contextual at a statement boundary when its condition/binding is followed by a top-level `else`. Existing `guard()`, `guard = value`, `object.guard` and `guard:` labels retain their meaning. Like other JS statements, use semicolons where adjacent expressions could otherwise join across lines. Parameter and expression tokens retain their original source positions, so TS narrowing and diagnostics operate on the lowered code.

## Builders

Builder callee names must be explicitly listed in `trailing.config.json` or plugin options. Exact dotted names such as `UI.Stack` are accepted; computed names and aliases must be configured at the spelling used in source. Configuration is textual and lexical: a shadowed function with the same spelling is also a builder. Prefer distinct adapter bindings.

Each builder closure declares a hygienic local array, appends each expression statement, then returns the array. It collects through blocks, conditionals, loops, switches, and try/catch/finally. Function and class bodies are excluded. `return` in the builder's own scope is rejected. `break`, `continue`, and `throw` retain their meaning. Side-effect expressions also contribute their return values; use declarations or a helper if that is unwanted.

React receives the array as `children`; Vue receives it when the child invokes the default slot. Ordinary closures never gain child collection unless configured. Calling a raw React component as a function still has React's ordinary hook constraints; use the adapter.

## Compatibility boundaries

Supported baselines are modern JavaScript and TypeScript 5.9 syntax, including generics, typed closures, interfaces, enums, namespaces, mapped types, `as`, `satisfies`, `const` type parameters, private fields, import attributes, decorators supported by the parser, and JSX in the `x` extensions. This is not a replacement implementation of the entire evolving TypeScript parser; unsupported constructs must fail with a source diagnostic. Use the compatibility tests as the exact executable contract.

JSX lowers to the React automatic runtime in build plugins and the Node loader. Vue works through its adapter and `h()`; Vue JSX and `.vue` SFC transformation require their own tools and are not provided by this package. TypeScript project-reference builds and declaration emission are not supported by the virtual-project checker. Emit distribution declarations through a normal TS source generation pipeline if needed.

Local imports are supported. Standard resolver aliases, package exports and bare packages are delegated to the host; custom extensionless aliases should include the full extension when the host cannot resolve them. Loader hooks do not transpile unrelated `.ts` dependencies on Node versions without native TypeScript support. Ordinary `.ts` importing extended source is checked by the CLI but may show an unresolved module in VS Code's native TypeScript service.

The VS Code extension's common-input recovery is deliberately limited. Arbitrarily malformed input can temporarily suspend semantic assistance; strict syntax diagnostics remain visible. Formatting, rename, auto-import edits, React Fast Refresh, and framework-specific named-slot syntax are future work.
