# RFC 0017: If expressions

**Status:** Proposed. **Kind:** Language. **Release:** Not released. **Dependencies:** None.

## Problem and native baseline

Nested ternaries are difficult to scan, while an if statement assigning a temporary separates binding from decision. An expression form should allow `const label = if (ready) { 'Ready' } else { 'Waiting' };`.

## Design

The example is proposed syntax. Recognize if in expression positions only; native if statements keep their meaning. An expression requires else and every successful branch must produce one value or throw. The initial scope is a single expression per branch, with else-if chains; multi-statement/yield blocks remain an open design question. Only the selected branch evaluates. Result types are inferred as a native union/common contextual result, without widening to any.

Conditions initially keep the selected language condition policy; RFC 0023 proposes stricter boolean checking. Branch lexical bindings cannot escape. Await/yield must remain in the enclosing execution context or be rejected explicitly; no hidden async IIFE or additional promise adoption is permitted.

## Lowering and interoperability

Single-expression branches can lower to a parenthesized native conditional expression, avoiding an IIFE and retaining suspension order. Throw branches require direct-return lowering or an explicitly specified helper/block transformation; their support is gated on that design. Emit native types/declarations and source maps; no runtime module is needed for ordinary branches.

## Compatibility and alternatives

Native ternaries and statement if remain supported. A single-expression initial scope prevents accidental last-statement returns. New branch-block behavior must not reuse component collector rules.

## Validation and completion

Check else completeness, nested if/ternary precedence, lazy branch effects, contextual inference, throw and suspension semantics, dangling else, comments and native adjacent syntax. Verify formatting/idempotence, lint fix ranges, editor branch diagnostics, highlighting and emitted output costs.

## Open questions and decision history

Resolve throw and multi-statement branch lowering before those forms are accepted. Start with expression-only branches if evidence supports the feature.
