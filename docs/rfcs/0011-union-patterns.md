# RFC 0011: Discriminated-union object patterns

**Status:** Implemented (retrospective specification).
**Kind:** Language. **Release:** 0.1.2. **Dependencies:** 0010.

## Problem and native baseline

Native TS union handling switches on a tag and then destructures the narrowed object. `case { kind: 'ok', value }: value;` combines selection and payload binding.

## Design

Every object arm has exactly one noncomputed literal discriminator and uses the same key across the switch. Other properties are native binding patterns, including renames, defaults, nested bindings and rest. Literal discriminators include strings, numbers, booleans, bigint and null; regex literals are excluded. Object arms cannot mix with value arms; one default is allowed. Bindings have independent arm scopes.

Selection tests the common tag, then destructures the selected object. Nested binding patterns are not deep matching predicates or validation. Native object rest excludes all mentioned keys, including the discriminator. A discriminator getter is read during selection and again during selected-arm destructuring; this observable behavior is part of the current contract.

## Lowering and interoperability

Evaluate the subject once, switch on its discriminator and perform the original destructuring in the arm. A hygienic discarded tag binding preserves rest exclusion. Native TS narrowing proves payload types and RFC 0010's completeness check. Objects are not wrapped or copied except ordinary object-rest allocation. There is no enum runtime.

## Compatibility and alternatives

Handwritten discriminator switches are equivalent. Accepted RFC 0015 implements unreleased constructors/types for associated-value enums while retaining this matching form. RFC 0016 must preserve these existing getter/default timings or explicitly version any change.

## Validation and completion

[Branching tests](../../packages/twill/tests/branching.test.ts) cover literal tags, getters/rest/defaults, hygiene, narrow payloads, omitted variants and JSX. [Formatter branching tests](../../packages/formatter/tests/branching.test.ts), typed lint mappings and editor completion/rename verify original pattern tokens.

## Decision history

Retrospective specification; arbitrary structural matching is not shipped.
