# RFC 0007: Nullish guard bindings

**Status:** Implemented (retrospective specification).
**Kind:** Language. **Release:** 0.1.2. **Dependencies:** 0006.

## Problem and native baseline

`const user = find(id); if (user == null) return;` is a frequent nullable lookup. `guard const user = find(id) else { return; }` combines the immutable binding and exiting nullish branch.

## Design

Exactly one const declaration is accepted, with optional native TS annotation. The initializer evaluates once. Only null and undefined fail; zero, false, empty strings and NaN survive. An identifier is initialized before the failure block, where it may still be nullish. Success narrows it in the enclosing lexical scope. Binding guards require an explicit surrounding block when used as a conditional/loop body.

Destructuring has a distinct evaluation contract in [RFC 0008](0008-destructured-guard-bindings.md). This binding does not validate JSON, catch exceptions or unwrap an arbitrary result object. Thrown/rejected initializers propagate normally.

## Lowering and interoperability

Lower to `const user = find(id); if (user == null) { return; }`. Retain declaration and member tokens for TS inference, references and diagnostics. Awaited initializers stay in the enclosing async function. No runtime import or closure is introduced.

## Compatibility and alternatives

Native const plus an exiting nullish test remains supported. JS `let` keeps mutable semantics; the syntax does not copy Swift's meaning of let. Branch-local bindings are separately proposed in RFC 0018.

## Validation and completion

[Guard tests](../../packages/twill/tests/guard.test.ts) verify falsy values, one evaluation, narrowing, exceptions, annotations and illegal multiple/unbraced bindings. Preserve TDZ, safe rename, formatting, lint fixes and type errors at original tokens.

## Decision history

Retrospective nullish contract for released guard bindings.
