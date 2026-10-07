# RFC 0003: Single-expression implicit returns

**Status:** Implemented (retrospective specification).
**Kind:** Language. **Release:** 0.1.2. **Dependencies:** 0002.

## Problem and native baseline

`values.map(value => value * 2)` has a concise expression body. Trailing closures need the same convenience without treating every statement as a returned value.

## Design

An ordinary trailing closure containing exactly one expression statement returns that expression. A multi-statement closure retains arrow block semantics and needs an explicit return. Declarations and native switch statements are not expressions. Parenthesize a switch expression or write `return switch (...)` to disambiguate it from a switch statement.

`implicitReturn: false` disables this convenience. Explicit returns retain their scope and native async behavior. Component children collection is a different contract in [RFC 0012](0012-component-children.md); render-prop closures use this ordinary callback contract.

## Lowering and interoperability

The compiler inserts `return` into the existing arrow body. The expression evaluates once when invoked; its exact value, including undefined or a promise, is returned. Async arrows keep normal promise adoption. No wrapper, last-expression inference or extra scheduling is introduced.

## Compatibility and alternatives

An explicit return is always available. Automatically returning the last statement of a multi-statement closure would change side-effect workflows and is not the current rule. Native functions/arrows remain unchanged.

## Validation and completion

[Compiler tests](../../packages/twill/tests/compiler.test.ts) and [configuration tests](../../packages/twill/tests/config.test.ts) cover values, multi-statement bodies and disabling the option. [Formatter tests](../../packages/formatter/tests/formatter.test.ts) preserve the distinction after formatting. Check thrown expressions, async callbacks, parentheses, comments, inferred callback results and original diagnostic positions.

## Decision history

Retrospective specification of 0.1.2; no new last-expression return proposal is accepted here.
