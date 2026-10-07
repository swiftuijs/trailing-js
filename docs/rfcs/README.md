# Twill RFCs

Every language feature and public tooling capability has an independent RFC. RFC 0001 describes the product direction; the feature RFCs describe contracts and proposals. The [syntax reference](../syntax.md) remains the user-facing specification for released syntax.

## Status and review process

- **Implemented** records behavior already shipped in 0.1.2. These are retrospective specifications, not claims that an earlier RFC review happened.
- **Proposed** describes unimplemented behavior. Syntax examples in a proposed RFC are design examples and are not accepted by released compilers.
- **Accepted** records a maintainer's design decision and links the review. Acceptance does not mean the feature is available.
- **Implementing** links an implementation PR and its remaining acceptance work.
- **Implemented** for a new feature requires a merged implementation and a release/version reference. Rejected and withdrawn proposals retain their numbers and decision history.

Create or amend the feature RFC before its implementation PR. Keep implementation PRs focused on one feature; put dependencies and RFC links in the description. A proposal can evolve alongside an implementation PR, but it stays proposed until a maintainer records acceptance. RFC acceptance is an explicit review decision, distinct from authorization to prototype or open a PR.

Use [the template](TEMPLATE.md). Specify the problem, native baseline, syntax, semantics, emitted TS/JS, interoperability, costs, alternatives, compatibility, validation and unresolved decisions. Existing behavior changes need an RFC amendment and migration notes. A feature is complete only after the compiler, checker, mappings, formatter, linter, highlighter and packaged editor support its contract.

The language may introduce its own semantics. Changes to existing JS/TS spellings, identity, coercion or scheduling must be explicit, versioned and include a native-module boundary and migration plan. There is no requirement to copy Swift's spelling or to introduce every proposal below.

## Direction

| RFC                                | Topic                                     | Status          |
| ---------------------------------- | ----------------------------------------- | --------------- |
| [0001](0001-practical-language.md) | Product direction and acceptance criteria | Active guidance |

## Released language features

| RFC                                         | Feature                                     | Status             |
| ------------------------------------------- | ------------------------------------------- | ------------------ |
| [0002](0002-trailing-closures.md)           | Trailing closures and parameter headers     | Implemented: 0.1.2 |
| [0003](0003-implicit-returns.md)            | Single-expression implicit returns          | Implemented: 0.1.2 |
| [0004](0004-labelled-trailing-closures.md)  | Multiple labelled trailing closures         | Implemented: 0.1.2 |
| [0005](0005-implicit-member-callbacks.md)   | First-argument implicit member callbacks    | Implemented: 0.1.2 |
| [0006](0006-guard-conditions.md)            | Guard conditions and required exits         | Implemented: 0.1.2 |
| [0007](0007-guard-bindings.md)              | Nullish guard bindings                      | Implemented: 0.1.2 |
| [0008](0008-destructured-guard-bindings.md) | Destructured guard bindings                 | Implemented: 0.1.2 |
| [0009](0009-defer.md)                       | Scoped synchronous and asynchronous cleanup | Implemented: 0.1.2 |
| [0010](0010-switch-expressions.md)          | Switch expressions and exhaustiveness       | Implemented: 0.1.2 |
| [0011](0011-union-patterns.md)              | Discriminated-union object patterns         | Implemented: 0.1.2 |
| [0012](0012-component-children.md)          | Native JSX component children closures      | Implemented: 0.1.2 |
| [0013](0013-render-prop-closures.md)        | React render-prop closures                  | Implemented: 0.1.2 |
| [0014](0014-vue-slots.md)                   | Lazy default and named Vue slots            | Implemented: 0.1.2 |

## Proposed language features

The first implementation milestone is associated-value enums using existing object-pattern switches. Broader pattern matching is a separate proposal. Error propagation follows after those foundations; structured concurrency needs its own runtime design.

| RFC                                      | Feature                               | Status   | Dependencies                                |
| ---------------------------------------- | ------------------------------------- | -------- | ------------------------------------------- |
| [0015](0015-associated-value-enums.md)   | Associated-value enums                | Proposed | 0010, 0011                                  |
| [0016](0016-pattern-matching.md)         | Broader pattern matching              | Proposed | 0010, 0011; enum patterns depend on 0015    |
| [0017](0017-if-expressions.md)           | If expressions                        | Proposed | None                                        |
| [0018](0018-optional-branch-bindings.md) | Branch-scoped optional bindings       | Proposed | 0007, 0008                                  |
| [0019](0019-typed-error-propagation.md)  | Explicit typed error propagation      | Proposed | 0015 for the optional result representation |
| [0020](0020-structured-concurrency.md)   | Structured concurrency                | Proposed | Error/cleanup contracts; runtime prototype  |
| [0021](0021-immutable-values.md)         | Immutable records and value semantics | Proposed | None                                        |
| [0022](0022-argument-labels.md)          | Function argument labels              | Proposed | Declaration/editor metadata design          |
| [0023](0023-boolean-conditions.md)       | Boolean condition checking            | Proposed | Checker extension                           |
| [0024](0024-exact-numeric-types.md)      | Exact numeric and domain types        | Proposed | Explicit runtime and operator design        |

## Released tooling capabilities

| RFC                                          | Capability                               | Status             |
| -------------------------------------------- | ---------------------------------------- | ------------------ |
| [0025](0025-mixed-project-checking.md)       | Mixed-project checking and editor bridge | Implemented: 0.1.2 |
| [0026](0026-build-and-loader-integration.md) | Build adapters and Node ESM loader       | Implemented: 0.1.2 |
| [0027](0027-declaration-emission.md)         | Native declaration emission              | Implemented: 0.1.2 |
| [0028](0028-native-source-export.md)         | Checked native source export             | Implemented: 0.1.2 |
| [0029](0029-formatting.md)                   | Source-preserving formatting             | Implemented: 0.1.2 |
| [0030](0030-linting.md)                      | Mapped lint diagnostics and safe fixes   | Implemented: 0.1.2 |
| [0031](0031-highlighting.md)                 | Shared TS/TSX and Twill highlighting     | Implemented: 0.1.2 |

## Implementation checklist

An implementation PR links the RFC, identifies supported and deferred portions, and records relevant commands and outcomes. Check parser/lowering and negative diagnostics, runtime/evaluation order, native syntax compatibility, types and mixed-file declarations, source mappings and editor edits, formatting/idempotence, lint positions/fix safety, grammar scopes and actual colors, and independent packaged consumers. Use `pnpm check` plus feature-specific browser/editor/package checks as applicable. Update the public syntax guide, compatibility page and changelog when behavior is implemented. Changes that affect packaged syntax need a coordinated release, independently of merging their PR.
