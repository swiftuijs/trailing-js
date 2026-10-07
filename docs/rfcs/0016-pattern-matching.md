# RFC 0016: Broader pattern matching

**Status:** Proposed. **Kind:** Language. **Release:** Not released.
**Dependencies:** 0010, 0011; enum-case patterns additionally depend on 0015.

## Problem and native baseline

Nested business decisions repeat tag tests, payload destructuring and secondary conditions. Native TS combines a discriminator switch with nested if statements. Matching should combine selection and local bindings while keeping exhaustive state handling reviewable.

## Design

Explore explicit enum-case patterns, nested tag patterns, alternative patterns and a where predicate. Design examples use text fences because no new pattern spelling is accepted yet. An initial example could be `case LoadState.loaded(value) where value > 0: value;`. This is a pattern, not a constructor call or an instanceof test.

Specify a separate pattern AST instead of guessing from normal expressions. Arms are tried in source order. The subject is evaluated once; only a selected candidate evaluates its predicate, and only a winning arm runs its value. Pattern bindings are immutable and scoped to the arm/predicate. Alternatives must bind the same names with compatible types. A predicate must be boolean and cannot prove exhaustive coverage unless a later unconditional pattern covers that variant. Throwing getters/predicates propagate; matching does not catch them.

Existing object arms keep RFC 0011's binding semantics and getter timing. Deep literal tests must use distinct pattern syntax so a native destructuring default never becomes a predicate. Open/unbounded shapes require a default; complete tag coverage can use TS narrowing. Range patterns, recursive patterns and multi-statement result blocks need separate amendments if included later.

## Lowering and interoperability

Lower to ordered native branches using a hygienic subject binding, native narrowed payload bindings and explicit predicates. Do not add nominal brands or inspect generated constructor identity. Additional property reads must be specified; avoid caching getters silently. An expression wrapper has the same suspension restrictions/cost disclosure as RFC 0010 unless a new lowering eliminates it. Native union types remain usable.

## Compatibility and alternatives

Nested native switches/if statements are the baseline. Existing value cases retain strict equality and native evaluation order. A matching form that looks like a function call needs an explicit parser context and cannot execute that call during selection. This RFC does not grant acceptance to every Swift pattern.

## Validation and completion

Test binding scope, alternatives, narrowed payloads, guarded-case coverage, added variants, predicate order/side effects, getter counts, exceptions and native expression ambiguities. Include formatter AST support, negative diagnostics, grammar scopes, packaged case/payload completion and rename, linter mappings, declarations and emitted native execution. Compare emitted branches against equivalent handwritten code.

## Open questions and decision history

Choose enum-pattern spelling, nested-test syntax and a coverage algorithm before implementation. Associated-value enum construction can ship independently using existing patterns.
