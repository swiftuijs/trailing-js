# RFC 0018: Nullish bindings in if branches

**Status:** Proposed. **Kind:** Language. **Release:** Not released. **Dependencies:** 0007, 0008.

## Problem and native baseline

The proposed Twill addition is an `if const` declaration that binds a non-nullish value only inside the success branch. Native TS/JS uses a temporary plus a nullish test for this task. Explore `if const user = find(id) { use(user); } else { missing(); }` without changing JS let's meaning. Optional chaining (`?.`) and nullish coalescing (`??`) remain native operators; an initializer may use them with their existing behavior.

## Design

Spelling is proposed and requires ambiguity review. Evaluate the initializer once; null/undefined select the failure branch, while falsy values survive. The immutable successful binding exists only inside the success branch. It is unavailable in else, after the expression/statement, and during its own initializer. Destructuring checks the whole initializer first, with native defaults/getters on success. Else is optional for a statement form; interaction with RFC 0017 requires a separate completeness rule.

An awaited initializer stays in the enclosing async scope. Do not catch rejection or validate nested shapes. Multiple comma-separated optional bindings and while bindings are outside the initial proposal.

## Lowering and interoperability

Lower to a hygienic temporary and a scoped native nullish conditional, then const binding/destructuring on success. Ordinary TS narrowing supplies types. Avoid returning a bound variable through a generated closure. Allocation is limited to native destructuring/rest operations; there is no optional wrapper type.

## Compatibility and alternatives

Native temporary plus if and existing guard bindings remain supported. Success binding differs from guard because it does not survive after the branch. Do not reinterpret valid native if parentheses or JS let mutability.

## Validation and completion

Test falsy/nullish values, side-effect counts, scope/TDZ, else shadowing, array iterators/defaults, async failures and nested branches. Require source-safe rename, contextual completion, lint positions, formatter round trips, grammar support and native execution parity.

## Open questions and decision history

Choose unambiguous spelling and define composition with if expressions. Initial scope deliberately matches existing nullish guard semantics.
