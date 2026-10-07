# RFC 0024: Exact numeric and domain types

**Status:** Proposed. **Kind:** Types and explicit runtime. **Release:** Not released.
**Dependencies:** Numeric/operator and native-boundary design.

## Problem and native baseline

JS number cannot represent all 64-bit integers exactly and binary decimals complicate money. Native bigint, validated integer cents and decimal libraries are available, but unit mixing and conversions remain easy mistakes.

## Design

Separate exact representation from domain units. An Int64-like type specifies signed range, checked overflow and explicit conversion to/from bigint/number/string. A Decimal-like type specifies scale/precision, rounding mode and division rules. Domain types such as Duration/Money prevent mixing unrelated units and currencies. Start with an explicit library API and TS opaque types; evaluate language literal/operator support only after those contracts exist.

Reject implicit precision-losing conversion and mixed arithmetic. Define equality, ordering, JSON serialization, NaN/infinity treatment, parse failures and locale-independent strings. Do not change native number/bigint operators or advertise decimal arithmetic as exact without a rounding contract.

## Lowering and interoperability

Int64 can use bigint plus range checks. Decimal requires a reviewed runtime representation; domain units may erase to a chosen representation only where validation remains sound. Typed literal/operator lowering must disclose helper calls and runtime imports. Native boundaries perform explicit checked conversions and package ordinary declarations.

## Compatibility and alternatives

Bigint, decimal libraries, branded types and integer cents are baselines. Swift motivates explicit numeric intent; its type names alone do not determine JS implementation. Global operator overloading is outside the initial proposal.

## Validation and completion

Test range boundaries, overflow, rounding ties, repeated arithmetic, division, cross-unit rejection, serialization and unsafe conversion diagnostics. Compare performance/bundle size against equivalent libraries. Require native consumer types, editor operations, formatter/highlighting and independent runtime package tests before language syntax.

## Open questions and decision history

Choose representation, rounding/overflow policy and domain units separately. No new numeric runtime or literal syntax is shipped by this RFC.
