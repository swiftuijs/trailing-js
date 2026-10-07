# RFC 0027: Native declaration emission

**Status:** Implemented (retrospective specification).
**Kind:** Tooling. **Release:** 0.1.2. **Dependencies:** 0025.

## Problem and native baseline

A Twill library must be usable from ordinary TS without publishing dialect source as its only type interface. Native TS declaration emission from checked transformed source is the baseline.

## Design

`twill declarations -p tsconfig.json -o dist` emits standard declarations and composed declaration maps. `--build` visits project references in dependency order. Use the configured native types and normal declaration options. Source errors are diagnostics with nonzero CLI failure; the tool does not suppress them to produce apparently valid types. Native incremental tsc --build is not implemented.

## Lowering and interoperability

Use the mixed project's transformed snapshots and TypeScript's emitter, then compose emitted mappings back to dialect source. Standard imports/exports and generic/result types remain native .d.ts surfaces. Runtime JS library builds stay with Vite or another host; declaration emission is not a runtime bundler. Consumers need no Twill checker to read emitted types.

## Compatibility and alternatives

Handwritten declarations or exported native source remain possible but may drift from implementation. New language features must demonstrate a representable native declaration contract or explicitly document metadata/runtime dependencies.

## Validation and completion

[Declaration tests](../../packages/twill/tests/declarations.test.ts), [backend contracts](../../packages/twill/tests/declaration-backend.test.ts) and independent native consumers verify exports, inferred types, source maps, errors and project ordering. Check exact diagnostic coordinates and behavior when declaration-only emit fails.

## Decision history

Retrospective standard-declaration contract; full incremental builds remain outside its scope.
