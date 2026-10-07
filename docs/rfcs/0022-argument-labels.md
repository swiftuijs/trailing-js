# RFC 0022: Function argument labels

**Status:** Proposed. **Kind:** Language. **Release:** Not released.
**Dependencies:** Checker, declaration and editor metadata design.

## Problem and native baseline

Calls such as `connect(host, true, false)` obscure argument roles. Explore declared call labels such as `connect(to: host, secure: true)` while retaining positional JS functions at runtime.

## Design

Labels must be part of the API's declaration, not inferred from implementation parameter names. Distinguish the external label from the local binding name. Require known labels at checked calls and define omission, defaults, rest, spreads, overloads, callbacks and function assignment compatibility. Initially preserve declaration/call order rather than reordering side effects. Duplicate/missing labels are source diagnostics.

Native functions with no declared label metadata use positional calls or an explicit adapter. RFC 0004's existing trailing labels remain positional annotations; introducing semantic labels cannot silently reinterpret them. Labels are not object-literal property names and need an expression grammar that preserves existing ternary/object syntax.

## Lowering and interoperability

Emit an ordinary positional function signature/call. Arguments evaluate in source order exactly once. Standard .d.ts erases external labels unless a reviewed metadata convention carries them; native callers remain positional. Preserve labels across Twill imports, declarations/export and editor signature help. Do not reflect on runtime function source or TS parameter spelling.

## Compatibility and alternatives

An options object is the native baseline and already permits extensible named inputs. Language labels are most useful for stable APIs and must justify their metadata cost. Reordering labelled calls is deferred until its evaluation strategy is specified.

## Validation and completion

Test overload selection, generic inference, function values, default/rest/spread rules, native adapters, evaluation order, signature help, label rename and declaration round trips. Require parser/formatter ambiguity tests and mapped lint/highlighting support.

## Open questions and decision history

Choose declaration spelling and interoperable label metadata. No semantic argument-label feature is currently released.
