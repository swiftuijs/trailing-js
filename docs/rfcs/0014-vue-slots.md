# RFC 0014: Lazy default and named Vue slots

**Status:** Implemented (retrospective specification).
**Kind:** Language. **Release:** 0.1.2. **Dependencies:** 0002, 0004, 0012.

## Problem and native baseline

Vue slot objects contain several callbacks. `Card { <Body /> } footer: { <Footer /> }` makes their content readable while retaining Vue's lazy slot model.

## Design

Vue component closures produce a slot object. The first closure is the default slot; subsequent labels name slots. Duplicate slot names are rejected. Headers support scoped-slot parameters. Vue's native JSX declarations determine inference and can require explicit annotations under noImplicitAny.

Select the normal JSX runtime through tsconfig's jsxImportSource, including inheritance, or a file pragma. Without explicit selection, a Vue import selects Vue and React is the fallback. Files using only third-party Vue components should specify the standard runtime setting explicitly.

## Lowering and interoperability

Emit native Vue JSX with default/named arrows in its slot object. Reads and child creation occur when the child invokes the slot, preserving reactive dependency tracking. No eagerly constructed React-style children array replaces a Vue slot. Components/props retain normal Vue types and identity. Allocation matches explicit slot callbacks plus the slot object.

## Compatibility and alternatives

Native Vue JSX slot objects remain available. Slot labels are semantic names, unlike ordinary positional closure annotations. Vue SFC compilation still belongs to the host Vue plugin.

## Validation and completion

[Framework tests](../../packages/twill/tests/frameworks.test.ts), Vue SSR example tests and TS configuration checks cover laziness, named slots, duplicates, scoped parameters and runtime selection. Verify formatter boundaries, JSX highlighting and mappings against native Vue declarations.

## Decision history

Retrospective specification of the shipped lazy slot behavior.
