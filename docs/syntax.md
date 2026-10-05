# Syntax and semantics

The extension adds a trailing closure to an identifier, a member expression, or a call expression. The closure becomes the call's final argument. Parenthesized callable results, such as `(factory()) { ... }`, invoke the result. Empty parentheses can be omitted, including tightly written TS type arguments: `items.map<number> { x in x * 2 }`. Spaced comparisons retain the ordinary JS operator grammar. Calls can chain after the closure: `items.map { x in x * 2 }.filter(Boolean)`.

```text
call { statements }
call { parameters in statements }
call { async parameters in statements }
call { statements } label: { statements } another: { statements }
```

Use parentheses for typed parameters, destructuring, defaults, rest parameters, or a return annotation: `{ (value: number): string in String(value) }`. Bare names also work: `{ value, index in value + index }`. `async` is a modifier when followed by parameters; `{ async in async }` has a parameter named `async`.

One expression statement implicitly returns its value. Multiple statements have ordinary arrow-body semantics and require an explicit return. Set `implicitReturn: false` to disable the extension's implicit return. `$0`, Swift parameter labels at the call site, capture lists, `throws`, Swift types, and if/switch expressions are not part of this language.

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

The failure block must provably exit: a direct `return`, `throw`, `break`, or `continue`; a nested block with an exit; or an `if` with exits in both branches. Exit inference is deliberately conservative: calls (even TS `never` functions), loops, switch statements and try statements do not prove an exit. Existing JS rules still determine whether a return or labeled break/continue is legal. Each guard inside a failure branch is checked independently. In a component children closure, own-scope `return` remains forbidden; `throw` and loop exits are available. A condition guard used as a single unbraced body lowers inside braces so an outer `else` retains its original association.

`guard` is contextual at a statement boundary when its condition/binding is followed by a top-level `else`. Existing `guard()`, `guard = value`, `object.guard` and `guard:` labels retain their meaning. Like other JS statements, use semicolons where adjacent expressions could otherwise join across lines. Parameter and expression tokens retain their original source positions, so TS narrowing and diagnostics operate on the lowered code.

## Defer

```twill
function example(events: string[]) {
  defer { events.push('first'); }
  defer { events.push('second'); }
  return 42;
} // events gains 'second', then 'first'
```

At a statement boundary, an unescaped `defer` identifier followed by a same-line `{` introduces a cleanup. Horizontal whitespace and same-line block comments are permitted. `defer()` is a normal call, `defer() { ... }` a normal trailing-closure call; assignments, property access and `defer:` labels are unchanged. A newline before `{` keeps the identifier and block as ordinary separate statements. This contextual rule avoids reserving a new identifier throughout JS/TS.

Registration occurs only when execution reaches the statement. The nearest explicit block or function body owns it. Cleanup runs once, in reverse registration order, on fallthrough, return, throw, or a break/continue leaving that scope. A braced loop body owns a stack per iteration; an unbraced `for (...) defer { ... }` registers each callback in the surrounding block. Generator cleanup runs when its scope actually exits, including `.return()`; abandoning a suspended generator does not trigger cleanup.

Top-level module/script cleanup and unbraced switch-case cleanup are rejected. Wrap them in an explicit block. No process-exit hooks are installed. Cleanup arrows capture live lexical bindings, `this`, `arguments`, `super` and `new.target`; this is not value capture. Referencing a later binding works if it has initialized when cleanup executes; leaving before initialization retains the ordinary temporal-dead-zone error.

Cleanup may use local loops, local break/continue, nested functions and nested `defer`. Own-scope `return`, jumps to an outer label/loop and `yield` are rejected. Nested functions can return normally. An explicit `await` requires an enclosing async function and makes that cleanup async. Async cleanups finish serially in reverse order; synchronous cleanups in async functions add no await turn. Returning a promise from a nested helper does not implicitly await it: write `await helper()`. Similarly, `return await task()` keeps a resource alive until task completion; `return task()` exits the scope first, as with native finally.

All registered cleanups run even if the body or an earlier cleanup fails. A cleanup failure replaces the pending return/body error; a subsequent cleanup failure replaces that error, including `throw undefined`. If no cleanup fails, the original completion survives. This matches nested `try/finally`, rather than aggregating errors or using `SuppressedError`.

A single direct cleanup lowers to one optional callback and native `try/finally`, without an array, loop or error accumulator. Multiple or control-flow registrations use a lazy local array and reverse-order drain. Mixed sync/async registrations additionally store a small descriptor per cleanup. No runtime module is imported. Blocks without defer are untouched. Direct function-body function declarations retain hoisting, captures, directives and var/parameter bindings via generated initializers; JS JSDoc remains attached. Function overloads/ambient function declarations directly in a function body containing defer are currently rejected with a diagnostic; place the helper in a separate scope. This restriction is preferable to silently changing type semantics.

## Component closures in `.twillx`

A non-parenthesized uppercase identifier or dotted name with an uppercase final member, followed by a trailing closure, is UI syntax: `Card { ... }`, `Card(props) { ... }`, `UI.Card { ... }`. It becomes a native JSX element. Explicit generic type arguments are preserved. One props object is accepted; multiple props arguments, argument spreads and optional component calls are rejected with diagnostics. For a component without child content, use ordinary JSX, such as `<Icon />`; calls without a closure retain JS semantics.

In `.twill`, all trailing closures are ordinary callbacks. In UI files, lowercase names and parenthesized callable expressions retain ordinary callback behavior: `run { () in 42 }`, `(Run) { 42 }`. This is a lexical rule, like JSX component naming; it does not inspect export lists, special-case libraries or reflect on inferred function types. Alias lowercase component exports to uppercase names, as for JSX.

A single child expression is passed directly. A single final expression preceded only by declarations or `defer` returns its original value from the content closure. Other component closures collect expression statements into a hygienic local array through blocks, conditions, loops, switches and try/catch/finally. Declarations and nested functions/classes retain their scope. Own-scope `return` is rejected; `throw`, `break` and `continue` retain normal rules. Side-effect expressions also contribute their result, so use declarations or a helper when unwanted. `defer` executes when the children closure exits.

React receives a single collected value directly, or an array for multiple values; components are never invoked as ordinary functions. Keys, refs, hooks, memo and class identity follow JSX semantics. React supports one children closure. A parameter header such as `Data { value in <span>{value}</span> }` produces a function child (render prop), with parameter types inferred from native JSX props. It retains ordinary arrow-body semantics: one expression returns implicitly; multiple statements need an explicit return. Other render-prop callbacks belong in the props object.

Vue JSX receives a slot object containing a lazy default closure. Subsequent labelled closures become named slots, with duplicate names rejected. Default and named slot headers can declare scoped-slot parameters. Vue’s native JSX declarations may require explicit slot parameter annotations under `noImplicitAny`. The closure runs when the child invokes the slot, preserving reactive reads. Select the normal JSX runtime using tsconfig’s `jsxImportSource` (including inherited settings) or the standard file pragma. Otherwise a Vue import selects Vue and React is the default. Use an explicit standard setting in files importing only Vue third-party libraries or combining frameworks. Prop and slot checking follows the framework’s own JSX declarations.

Native JSX can be freely mixed with these closures. No component-name configuration, adapters or runtime wrapping functions are used. Ordinary data processing uses normal JS collection APIs; there is no globally configured result-builder mode.

## Compatibility boundaries

Only `.twill` (TS) and `.twillx` (TSX/UI) opt into the dialect. Both accept JavaScript syntax with optional types. Native JS files retain JS/JSDoc checking, and all standard source files keep their native parsers. The virtual checker appends a native suffix internally; avoid declaring another real file such as `helper.twill.ts` beside `helper.twill`, since that name is reserved for its virtual representation.

Supported baselines are modern JavaScript and TypeScript 5.9 syntax, including generics, typed closures, interfaces, enums, namespaces, mapped types, `as`, `satisfies`, `const` type parameters, private fields, import attributes, decorators supported by the parser, and JSX in the `x` extensions. This is not a replacement implementation of the entire evolving TypeScript parser; unsupported constructs must fail with a source diagnostic. Use the compatibility tests as the exact executable contract.

JSX lowers to the selected automatic runtime in build plugins and the Node loader (React by default, Vue via its JSX runtime). `.vue` SFC transformation still requires the host’s Vue plugin. Other standard automatic JSX runtimes can be selected through `jsxImportSource`; their ecosystem-specific transformations are outside this compiler. Use `twill declarations [-p tsconfig.json] [-o dist] [--build]` for standard declarations and composed maps. `--build` visits references in dependency order; native incremental `tsc --build` remains unsupported. Vite handles JS library emission.

Local imports are supported. Standard resolver aliases, package exports and bare packages are delegated to the host; custom extensionless aliases should include the full extension when the host cannot resolve them. The opt-in Node loader emits local native ESM TS/TSX/JSX as well as Twill and delegates npm dependencies to Node. Native TS/JS documents in configured VS Code mixed projects use the bundled TS-server bridge for cross-file types and mapped definitions. See [interoperability](interoperability.md) for loader and CommonJS boundaries.

The VS Code extension's common-input recovery is deliberately limited. Arbitrarily malformed input can temporarily suspend semantic assistance; strict syntax diagnostics remain visible. Rename, auto-import edits, import organization and safe spelling fixes map back to source. Unmappable edits are withheld. Formatting, general refactoring/fix-all and React Fast Refresh are future work.
