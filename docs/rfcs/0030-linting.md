# RFC 0030: Mapped lint diagnostics and safe fixes

**Status:** Implemented (retrospective specification).
**Kind:** Tooling. **Release:** 0.1.2. **Dependencies:** 0025 and source mappings.

## Problem and native baseline

ESLint cannot parse custom syntax directly, while linting generated files reports helper names and unsafe source fixes. A processor must map only meaningful diagnostics/edits back to authored source.

## Design

The linter package exposes recommended and recommendedTypeChecked flat configs. Dialect source becomes virtual TS/TSX, parsed against the mixed project for typed rules; native files use standard TS project service. Suppress generated-only diagnostics. Offer fixes/suggestions only when the complete range and replaced text match original source exactly. Unmappable fixes are withheld.

Typed configuration enables switch-exhaustiveness-check with considerDefaultExhaustiveForUnions false. Thus every known union variant needs an explicit case even with default, in both native and Twill files. This is opt-in lint enforcement, not a new compiler guarantee. Basic recommended config does not require type information. Run ESLint in CI and enable dialect language IDs in the editor's ESLint extension.

## Lowering and interoperability

Reuse compiler maps and project snapshots. Map exhaustive diagnostics on generated subjects back to a source-backed switch keyword. Configuration covers virtual suffixes as well as source files. Cached project/config changes refresh; adding/deleting files can require restarting the lint host. Public disposeProjects releases embedded caches.

## Compatibility and alternatives

Direct native TS linting is the baseline. Unsafe code fixes must never replace source with generated helpers. TypeScript/ESLint APIs are versioned integration contracts, not arbitrary-version compatibility.

## Validation and completion

[Linter tests](../../packages/linter/tests/linter.test.ts), [processor contracts](../../packages/linter/tests/processor-contracts.test.ts), [cache tests](../../packages/linter/tests/cache.test.ts) and independent ESLint 9/10 consumers cover strict coverage, real fixes, typed errors and original positions.

## Decision history

Retrospective lint contract and explicit-default coverage policy.
