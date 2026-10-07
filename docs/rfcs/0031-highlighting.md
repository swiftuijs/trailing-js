# RFC 0031: Shared native and Twill highlighting

**Status:** Implemented (retrospective specification).
**Kind:** Tooling. **Release:** 0.1.2. **Dependencies:** Implemented language grammar.

## Problem and native baseline

Treating Twill as only TS loses extensions; replacing TS grammar loses native operators, types and JSX. Web and editor presentation must agree through a shared grammar.

## Design

The highlight package owns shared TextMate registrations and Shiki helpers. Twill includes native TypeScript expression/type grammar; TwillX includes TSX and extension injections. Register native typescript/tsx dependencies with the custom grammars in VitePress. A custom-language registration alone cannot assume later TS fence loading repairs missing includes.

Implicit member expressions delegate native expression content so operators such as &&, ?? and optional chains keep their scopes. Parameterless closures containing JSX need TSX-aware injection. Literal text/strings and JSX text must not gain code scopes; embedded/template expressions still do. VS Code's checked-in grammars stay synchronized with the package source.

## Lowering and interoperability

Highlighting never transforms or executes application code. Use ordinary theme scopes rather than hardcoded extension colors. Shiki owns tokenization/rendering; the helper returns standalone highlighted HTML. Application/runtime compiler imports are unnecessary. Existing TS/TSX token colors should match when identical native syntax is used.

## Compatibility and alternatives

GitHub TS/TSX fallback is useful but not the dedicated grammar. Do not maintain an unrelated docs-only grammar or replace native keywords/operators with a tiny custom token list.

## Validation and completion

[Highlight tests](../../packages/highlight/tests/highlight.test.ts), [independent Shiki consumers](../../packages/highlight/tests/consumer.mjs), docs token/color tests and packaged editor grammar tests cover native scopes, literal exclusions, operator/JSX cases and light/dark desktop/mobile rendering. Shiki 2/3/4 consumers verify portable registrations.

## Decision history

Retrospective specification including the shared fixes released in 0.1.2.
