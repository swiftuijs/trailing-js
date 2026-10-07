# RFC 0012: Native JSX component children closures

**Status:** Implemented (retrospective specification).
**Kind:** Language. **Release:** 0.1.2. **Dependencies:** 0002; optional 0009/0010.

## Problem and native baseline

JSX children often need separate array/map expressions for imperative control flow. In .twillx, `Panel { if (ready) { <Content />; } }` supplies ordinary JSX children through familiar statements.

## Design

Only a non-parenthesized uppercase identifier or member with an uppercase final name selects component syntax in .twillx. One props object and generic type arguments are accepted. Multiple props arguments, spreads and optional component calls are rejected. In .twill, trailing closures are ordinary callbacks. Parenthesizing a callable forces ordinary callback behavior.

A single child passes its original value directly. A final expression preceded only by declarations/defer also returns its original value. Other closures collect expression-statement results into a local array, respecting blocks, branches, loops, switches and try/finally. Side-effect expressions also contribute their values. Nested functions/classes retain scope. Own-scope return is rejected; throw and legal loop exits remain available.

## Lowering and interoperability

Lower to native JSX with children as a value or hygienic collector result. Components are never called as ordinary functions. React keys, refs, hooks and identity follow its JSX runtime. General collection allocates an array/content closure; the single-child path avoids a collector. Runtime selection follows standard tsconfig/pragma settings and the documented Vue-import fallback. No component registry or language runtime is introduced.

## Compatibility and alternatives

Ordinary JSX remains available and can mix with closures. Uppercase lexical recognition is independent of imported library names. React render props and Vue slots have separate RFCs.

## Validation and completion

[Framework tests](../../packages/twill/tests/frameworks.test.ts), [branching tests](../../packages/twill/tests/branching.test.ts), actual React/Vue examples and framework browser rendering cover props, laziness, identity, collection and JSX composition. Preserve native framework declarations, formatting and packaged editor props checks. Measure general collection separately from single-child paths.

## Decision history

Retrospective native JSX contract; globally configured result builders are excluded.
