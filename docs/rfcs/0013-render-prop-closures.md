# RFC 0013: React render-prop closures

**Status:** Implemented (retrospective specification).
**Kind:** Language. **Release:** 0.1.2. **Dependencies:** 0002, 0003, 0012.

## Problem and native baseline

`<Data>{value => <span>{value}</span>}</Data>` becomes `Data { value in <span>{value}</span> }` while keeping the component's declared function-child type.

## Design

A parameter header on a React component child closure selects a function child rather than eager collection. Parameters use existing closure header syntax, with native contextual types from JSX props. One expression returns implicitly; multiple statements require explicit return. React accepts one children closure; other callback props belong in the props object.

## Lowering and interoperability

Emit native JSX whose children is an ordinary arrow. Creating the element does not invoke the render prop; the component controls invocation and frequency. Captures, async annotations and results follow normal arrows and the API's declared types. There is no component call, hidden render scheduling or runtime wrapper.

## Compatibility and alternatives

Native JSX function children remain equivalent. Headerless children collection is RFC 0012; implicit-member shorthand is for ordinary callbacks and does not select a render prop. The language cannot strengthen an untyped component's own lifecycle contract.

## Validation and completion

[Framework tests](../../packages/twill/tests/frameworks.test.ts), React example SSR and packaged editor integration exercise lazy invocation, contextual types, properties and diagnostics. Preserve function identity behavior, formatting, JSX token colors and source-safe rename.

## Decision history

Retrospective function-child contract; multi-closure React children are not accepted.
