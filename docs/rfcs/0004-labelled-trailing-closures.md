# RFC 0004: Multiple labelled trailing closures

**Status:** Implemented (retrospective specification).
**Kind:** Language. **Release:** 0.1.2. **Dependencies:** 0002.

## Problem and native baseline

`perform(successCallback, failureCallback)` becomes `perform { value in consume(value) } failure: { error in report(error) }`. Labels help a reader separate callback roles.

## Design

The first trailing closure is unlabelled. Subsequent closures require identifier labels and appear in source order. Each closure has its own header, scope and async modifier. Ordinary labels and unrelated following statements keep their native grammar.

Labels are source annotations for ordinary calls. They do not select overloads, reorder arguments or need to match TS parameter names. In Vue component closures they instead name slots, as specified in [RFC 0014](0014-vue-slots.md). React component syntax accepts one child closure.

## Lowering and interoperability

Ordinary labelled closures become consecutive positional arrow arguments. Their allocation and argument evaluation order match the equivalent call. The callee's existing signature checks callback positions. There is no metadata or runtime reflection.

## Compatibility and alternatives

Use an options object when an API needs named arguments. [RFC 0022](0022-argument-labels.md) proposes semantic argument labels separately; it cannot silently reinterpret these existing annotations. Parenthesized arrows remain the native baseline.

## Validation and completion

[Compiler](../../packages/twill/tests/compiler.test.ts), [edge-case](../../packages/twill/tests/edge-cases.test.ts) and [formatter](../../packages/formatter/tests/formatter.test.ts) suites exercise labels and nested calls. Validate positional order, independent headers, following JS labels, async callbacks, inference, diagnostics and formatting. Grammar/editor support must preserve callback boundaries.

## Decision history

Records the released positional contract; semantic argument labels are not shipped by this RFC.
