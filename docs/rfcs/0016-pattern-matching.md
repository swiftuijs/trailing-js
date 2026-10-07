# RFC 0016: Explicit enum-case patterns

**Status:** Proposed. **Kind:** Language. **Release:** Not released.
**Dependencies:** 0010, 0011, 0015. **Review:** Implementation and design review pending.
**Implementation prototype:** [feat/enum-case-patterns](https://github.com/swiftuijs/twill/tree/feat/enum-case-patterns).

## Problem and native baseline

Associated-value enums define variants once, but matching repeats literal tags and payload bindings. An explicit case reference should check that the factory exists and returns the named variant; payload bindings should be checked against the narrowed subject. The native baseline is a discriminator switch plus per-arm const destructuring. This improves readability and checking; it does not promise to execute faster than equivalent JavaScript.

## Phase-one design

Candidate syntax:

```text
return switch (state) {
  case enum LoadState.idle(): 'Idle';
  case enum LoadState.loaded({ value: result }): String(result);
  case enum LoadState.failed({ error }): throw error;
};
```

The enum keyword explicitly opts into a pattern. Ordinary `case Factory.loaded(input)` remains a native value case, with its original call, strict-equality comparison and evaluation order. This distinction is required for compatibility.

A case reference is a qualified identifier chain, including imported aliases and namespaces. Parentheses are mandatory; they contain either nothing or one native object binding pattern. An empty pattern selects the variant without binding its fields, including variants that have payloads. The object pattern destructures the selected variant record: aliases, defaults, nested bindings and rest retain native semantics. It is not a nested shape predicate. Rest includes kind unless the binding explicitly mentions it. Bindings are immutable, independently scoped to each arm and do not escape. Destructuring is evaluated only in the selected arm; exceptions propagate normally.

The reference is a compile-time descriptor. Checked TypeScript verifies a callable factory whose return type has a literal kind equal to the referenced case name. Structurally compatible native TypeScript factories and their declarations work without Twill metadata. The descriptor is not read or invoked at runtime, and enum object identity is not inspected. Native type-only imports may name descriptors. Matching is structural, with no nominal enum brand; compatible records retain the native boundary contract.

The subject is evaluated once. Its kind is read once for selection. Explicit bindings of kind or object rest perform their normal additional reads. Existing object arms preserve RFC 0011's discriminator re-read, exclusion from rest and getter/default timing. Enum patterns may mix with object arms using the kind discriminator and a default; they cannot mix with value arms or object arms using another discriminator. Default and duplicate-label ordering keep native switch behavior. Without default, every tag must be covered. Unknown tags throw the existing non-exhaustive-switch error in unchecked transpile-only execution.

Phase one applies to switch expressions. Ordinary native switch statements remain native. Await/yield retain RFC 0010's direct-return restrictions. Positional payload inference, contextual `.loaded`, where predicates, alternatives, ranges and nested literal predicates are deferred. A later amendment must define their evaluation and completeness rules.

## Lowering and interoperability

A checked branch contains an erased native TS factory witness:

```ts
case ('loaded' satisfies (
  typeof LoadState.loaded extends (...args: never[]) => { readonly kind: 'loaded' }
    ? 'loaded'
    : never
)): {
  const { value: result } = subject;
  return String(result);
}
```

This avoids global utility-type name collisions and does not cast the subject or suppress payload errors. A hygienic const kind binding supports native discriminant narrowing and exhaustive tag checking, including single-variant records. The final check uses an erased `typeof kind` witness on an inert numeric literal; it never casts the subject and introduces no runtime use of kind after the switch. Direct-return and standalone identifier-initializer lowering add no function; other expression positions retain the existing synchronous switch wrapper. Initializers preserve the original binding and its TDZ using a hygienic result temporary, labelled branch exit and original const/let/var declaration. Typed identifier annotations contextualize the temporary through an erased typeof query; user tokens remain source-backed. Output contains no matching runtime module, factory calls, reflection, serialization or extra result allocation. Native object-rest bindings retain their ordinary allocation cost.

Descriptor/property and binding tokens retain source maps for diagnostics, navigation, completion and local-variable edits. Enum symbol renames remain withheld under RFC 0015. Native descriptor method renames are also withheld across declarations and references: renaming the method without its literal tag changes the pattern. Native owner/import-alias and binding renames remain source-safe. Emit ordinary native declarations and checked source exports. Builds, Node loader, formatter, linter, highlighter, documentation playground and packaged editor must consume the same syntax.

## Compatibility and alternatives

The earlier call-shaped `case LoadState.loaded(value)` candidate is not adopted: it collides with an existing native expression, and positional field inference would require imported declaration resolution during isolated transpilation. Named native bindings remove that dependency and are available to browser/offline compilation. A runtime case registry or extractor would add property reads/calls and initialization costs; none is introduced.

## Validation and performance acceptance

Test local/imported/aliased/namespace/native/declaration-only factories; nullary/ignored payloads; unknown cases and nonliteral tags; single-variant and added-variant completeness; structural inputs; binding scope, defaults, rest, getters, exceptions, subject evaluation and owner side effects. Preserve native function-call value cases and existing object-pattern behavior. Cover direct/general expressions, throw, await/yield, defer, nested switches and TSX.

Require source-safe diagnostics/definitions/completion/rename, formatter comment preservation and idempotence, mapped lint positions and safe fixes, shared TS/TSX scopes, native declaration/source-export consumers, build adapters, Node loader, independent packages, browser worker and extracted VSIX host checks.

Compare generated application bytes and gzip with equivalent handwritten discriminator switches. Enforce deterministic bundle budgets and absence of imported runtime modules. Measure compile/check costs and isolated warmed runtime median/p95, recording environment, inputs, checksums and commit/tree identity. Report IIFE/rest costs separately; do not infer runtime speedups from source brevity or enforce noisy cross-machine timing ratios in CI.

## Decision history

The phase-one scope was narrowed on 2026-10-07 for native compatibility, isolated cross-module compilation and runtime efficiency. The prototype does not imply design acceptance or release. Later matching features require their own amendments and validation.
