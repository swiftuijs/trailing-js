# RFC 0029: Source-preserving formatting

**Status:** Implemented (retrospective specification).
**Kind:** Tooling. **Release:** 0.1.2. **Dependencies:** Implemented language ASTs.

## Problem and native baseline

Formatting lowered TS loses the authored language syntax. A dedicated Prettier parser/printer must format Twill source itself while reusing normal native printing.

## Design

The formatter package exposes a Prettier plugin plus format/formatGenerated APIs. Source formatting prints custom AST nodes for closures, headers, guards, defer, patterns and switch expressions, delegating native structures to Prettier's printer. Formatting must preserve comments, semantics, scopes and expression/statement distinctions, and be idempotent under supported options.

Semicolon-free output must keep hazardous following callees independent through ASI safeguards. Display-only generated formatting must not be substituted for compiler output carrying diagnostic/editor mappings. Source formatting errors remain syntax errors, not guessed rewrites.

## Lowering and interoperability

Formatting does not lower source or execute code. Native TS/JSX printing keeps standard options and framework syntax. The package is a development tool, not an application runtime; standalone consumers must receive their required parser/printer dependencies without relying on workspace hoisting.

## Compatibility and alternatives

Compiler output can be formatted for display/native export, but cannot replace original-source editing. Every language AST extension needs its own printer, visitor keys and comment/parenthesis contract before shipping.

## Validation and completion

[Formatter tests](../../packages/formatter/tests/formatter.test.ts), [printer contracts](../../packages/formatter/tests/printer-contracts.test.ts), [conformance](../../packages/formatter/tests/conformance.test.ts) and independent consumers check idempotence, parse/execution preservation, comments and public types. Packaged editor document formatting uses this same package.

## Decision history

Retrospective authored-source printing contract.
