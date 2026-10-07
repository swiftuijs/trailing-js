# RFC 0009: Scoped cleanup with defer

**Status:** Implemented (retrospective specification).
**Kind:** Language. **Release:** 0.1.2. **Dependencies:** None.

## Problem and native baseline

Try/finally separates resource acquisition from cleanup. `const handle = open(); defer { handle.close(); }` places cleanup beside acquisition while retaining native lifetime rules.

## Design

Reached registrations run on exit from the nearest explicit block/function body, in reverse registration order. An unreached registration does nothing. Cleanup runs on return, throw and legal jumps. A cleanup cannot return or jump out of its enclosing cleanup function. A switch case needs an explicit block for defer ownership.

Cleanup captures lexical bindings when invoked; it does not snapshot values at registration. Await in cleanup is explicit and requires an async enclosing scope; it delays scope exit. Sync cleanup does not silently await a returned promise. All cleanups run even when one throws. The last cleanup error takes precedence over an earlier completion/error, including throw undefined. The original completion survives if cleanup succeeds. Use return await when resource lifetime must include completion of returned async work.

## Lowering and interoperability

A single direct registration uses one optional callback and native try/finally. Dynamic/multiple registrations use a lazy local stack and reverse drain; mixed sync/async registrations use descriptors. No runtime module is imported. Native function-body hoisting, directives, var bindings and JSDoc are preserved; overload/ambient declarations directly in a defer function body are rejected. Standard using/await using keeps its own disposal protocol and composes with defer.

## Compatibility and alternatives

Native try/finally is suitable for allocation-sensitive paths; standard disposal is preferable for compatible resources. Defer does not infer ownership, aggregate errors or implement SuppressedError.

## Validation and completion

[Defer tests](../../packages/twill/tests/defer.test.ts), [runtime hooks](../../packages/twill/tests/runtime-hooks.test.ts) and independent package consumers cover ordering, failures, async timing, scope exits, TDZ and disposal composition. Measure callbacks/stacks against handwritten equivalents; preserve formatting and mapped diagnostics.

## Decision history

Retrospective lifetime and error-precedence contract for 0.1.2.
