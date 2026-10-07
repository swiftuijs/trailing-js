# RFC 0010: Switch expressions and exhaustiveness

**Status:** Implemented (retrospective specification).
**Kind:** Language. **Release:** 0.1.2. **Dependencies:** None; object arms use 0011.

## Problem and native baseline

A native switch assigning/returning a value repeats assignments or returns and needs an explicit never check for missing variants. `return switch (state) { case 'ready': 1; case 'failed': 0; };` provides a checked expression.

## Design

Switch is an expression only in expression positions. Each arm has one expression or throw expression, with normal semicolons/ASI. The subject evaluates once. Value cases keep native strict comparison and case-evaluation order; duplicate labels select the first match. Only the selected value runs. There is no fallthrough or arm-level break. Native switch statements retain native grammar and semantics.

Without default, TS output includes a post-arm `subject satisfies never`. Twill check and editor checking must prove this; finite unions can be exhaustive and unbounded values need a default. Default accepts a catch-all, so checking alone does not require explicit coverage of every variant. RFC 0030's optional typed lint policy additionally requires that coverage. Transpile-only builds/playground do not prove types. Unchecked unmatched values throw TypeError rather than returning undefined.

## Lowering and interoperability

A direct return lowers to a scoped native switch. Other expression positions use a synchronous lexical arrow IIFE. Await/yield in the switch requires direct return, retaining the enclosing async/generator scope; other positions reject suspension. This avoids hidden promise conversion. IIFEs can allocate; direct returns need no extra function. Native types and imported unions determine narrowing and result inference.

## Compatibility and alternatives

Native switches with explicit never checks remain supported. Multi-statement arms and arbitrary predicates are not this feature; RFC 0016 proposes broader patterns. An untrusted external value still needs runtime validation.

## Validation and completion

[Branching tests](../../packages/twill/tests/branching.test.ts) exercise evaluation order, suspension, omitted cases (TS1360), return inference and original diagnostic positions. Packaged editor tests remove a union arm and require the mapped diagnostic. Formatter, typed lint and JSX composition must preserve expression/statement distinctions.

## Decision history

Retrospective contract; stronger explicit-default coverage remains a lint policy.
