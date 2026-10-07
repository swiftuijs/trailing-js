# RFC 0025: Mixed-project checking and editor bridge

**Status:** Implemented (retrospective specification).
**Kind:** Tooling. **Release:** 0.1.2. **Dependencies:** Implemented language RFCs.

## Problem and native baseline

Native tsc cannot parse dialect files, and a transpile-only build loses semantic checks. Twill must support ordinary TS/JS consumers and editor navigation across the same project rather than maintaining separate types.

## Design

TwillProject loads normal tsconfig options and presents generated TS/TSX snapshots with composed original-source diagnostics. Twill check checks the mixed project, including generated never checks. Native files retain TS/JS/JSDoc checking. The VS Code language host and bundled TS-server bridge synchronize unsaved dialect files and supply cross-file types, definitions, references, rename, imports and safe fixes. TypeScript 5.9 defines the current semantic baseline.

No application code executes during language assistance. Strict syntax diagnostics remain visible when limited incomplete-input recovery cannot produce semantic assistance. Unsafe/unmappable edits are withheld; general refactoring and fix-all are unavailable. Avoid real files using the reserved virtual suffix, such as helper.twill.ts beside helper.twill.

## Lowering and interoperability

Cache unchanged transforms/snapshots, refresh affected disk files and rebuild on configuration changes. Token mappings must distinguish source-backed text from generated-only code. The private bridge ships in the VSIX and is not a public npm language runtime. Emitted native declarations expose types outside dialect-aware tooling.

## Compatibility and alternatives

Checking generated files with native tsc is an alternative but loses original source coordinates. Build success alone is not checking. Arbitrary workspace TS versions and native incremental tsc --build are not guaranteed.

## Validation and completion

[Project](../../packages/twill/tests/project.test.ts), [editor](../../packages/twill/tests/editor.test.ts), [TS plugin](../../packages/twill/tests/typescript-plugin.test.ts) and [real VSIX host](../../editors/vscode/tests/host.ts) tests cover mixed files, unsaved edits, mapped fixes and diagnostics. Validate invalid source, cache refresh, configuration changes and minimum/current editor hosts.

## Decision history

Retrospective specification; broader refactors require a separate amendment.
