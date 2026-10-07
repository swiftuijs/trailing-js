# RFC 0005: First-argument implicit member callbacks

**Status:** Implemented (retrospective specification).
**Kind:** Language. **Release:** 0.1.2. **Dependencies:** 0002.

## Problem and native baseline

`users.filter(user => user.active).map(user => user.name)` repeats a parameter name for simple member access. `users.filter { .active }.map { .name }` retains those API types.

## Design

A headerless ordinary trailing closure can use leading `.property` to refer to its first argument. Chains, optional access, method calls, guards and explicit returns keep normal JS semantics. Every leading member in that closure uses the same receiver. Nested trailing closures bind independently; normal nested functions/arrows/classes do not inherit it. Defer cleanup captures its enclosing callback receiver.

An explicit header, including an empty header, cannot mix with shorthand. Component children/slot closures use their own contracts. A headerless closure with no implicit members remains a zero-parameter closure. The implicit-return option still applies.

## Lowering and interoperability

Generate one collision-free arrow parameter and replace each leading dot with that parameter's member access. Property reads are not cached; `.method()` retains its receiver. This allocates only the ordinary arrow, with no proxy or helper. Callback contextual typing supplies the parameter type and catches unknown members.

## Compatibility and alternatives

Named headers support additional arguments and outer captures. This is not contextual enum/static-member lookup or Swift `$0`; those would require distinct proposals. Existing decimal literals, optional access and spread syntax retain their parsing.

## Validation and completion

[Compiler tests](../../packages/twill/tests/implicit-members.test.ts) cover scope boundaries, optional chains, operators and collisions. Packaged editor tests verify completion, hover, formatting and property rename. [Highlight tests](../../packages/highlight/tests/highlight.test.ts) preserve `&&`/`??` colors and literal scopes inside shorthand expressions.

## Decision history

Retrospective contract for the shipped first-argument shorthand.
