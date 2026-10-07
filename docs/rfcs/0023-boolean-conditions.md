# RFC 0023: Boolean condition checking

**Status:** Proposed. **Kind:** Checker policy. **Release:** Not released.
**Dependencies:** Mixed-project checker extension.

## Problem and native baseline

Truthy conditions conflate absent values with zero/empty strings. Explicit comparisons or strict-boolean lint help, but enforcement varies across projects. Explore a Twill policy requiring actual boolean conditions.

## Design

Check conditions in if, loops, conditional expressions and condition guards. Require boolean-compatible checked types; unknown/any and nullable booleans need explicit handling. Keep guard bindings nullish as specified in RFC 0007. Explicit Boolean(value), value != null and numeric/string comparisons document intended coercion. Logical &&/|| keep native operand-return semantics; checking their use as conditions must be specified separately from banning those operators.

The policy is initially opt-in for .twill/.twillx. Native .ts/.js modules keep their checker/runtime semantics. Making it a Twill default later requires a versioned migration and precise treatment of literal/never/generic types. Emit ordinary JS conditions rather than dynamically throwing when a non-boolean reaches runtime.

## Lowering and interoperability

Add type-aware diagnostics at original condition tokens. No runtime conversion or wrapper is needed. Transpile-only builds cannot enforce the policy; twill check/editor and CI must run it. External types can still lie, so this is a static checked-program guarantee.

## Compatibility and alternatives

TypeScript-eslint strict-boolean-expressions is the baseline. The language policy must add coherent defaults and mappings rather than duplicate a weaker rule. Retain native runtime truthiness for unchecked values and explicit adapters.

## Validation and completion

Cover boolean unions, optional flags, literals, numeric/string values, any/unknown/never, generic constraints and logical operand results. Test config discovery, native-file boundaries, condition positions, editor diagnostics and existing guards/formatting without changed emitted code.

## Open questions and decision history

Specify accepted types and configuration/default rollout before implementation. Existing Twill conditions still use native truthiness.
