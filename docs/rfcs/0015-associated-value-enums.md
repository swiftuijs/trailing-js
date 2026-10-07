# RFC 0015: Associated-value enums

**Status:** Accepted.
**Kind:** Language. **Release:** Not released. **Dependencies:** 0010, 0011, 0027.
**Review:** Accepted after implementation review in [PR #13](https://github.com/swiftuijs/twill/pull/13) on 2026-10-07. Named payload factories and existing object-pattern switches are the accepted scope; release remains pending.

## Problem and native baseline

TS discriminated unions express business states well, but each type, tag literal and object constructor is handwritten. A family such as idle/loading/loaded/failed should define its variants and payloads once. The baseline is a union of tagged records plus ordinary factory functions; the proposal must retain equivalent native TS consumers.

## Design

Accepted declaration syntax:

```text
export enum LoadState<T, E = Error> {
  case idle;
  case loading;
  case loaded(value: T);
  case failed(error: E);
}

const state: LoadState<number> = LoadState.loaded(42);
const idle = LoadState.idle();
```

Case names and payload fields are identifiers; every payload field has a native TS type annotation. An empty parameter list is equivalent to a payload-free case. All cases have factory functions, including payload-free cases, to keep invocation and allocation uniform. Construction is positional in declared field order. Duplicate case names, duplicate payload fields and a payload field named kind are errors. Optional/default/rest payload parameters, case assignments, methods and ambient/const forms are outside the initial proposal and must fail explicitly. Native TS numeric/string enums retain their existing syntax and semantics.

The declaration creates a same-named native union type and constructor value. Each variant is a record with readonly kind equal to the case name and readonly named payload fields. Readonly is a static property rule, not deep immutability or runtime freezing. Payload objects retain reference identity; construction does not copy them. Values remain structural and JSON-friendly; plain records of the same type are valid native inputs. There is no nominal identity or generated equality operator.

Generic parameter names, constraints and defaults use native TS syntax; const and variance modifiers are rejected in this initial scope. Constructor generics include type parameters needed by that case's payload types and their constraints/defaults; preserve their original order and transitive dependencies. A case that does not use a parameter must not force a meaningless inferred argument. Each factory returns its precise variant type. The overall enum alias contains all variants and preserves its declared generic parameters. The implementation must demonstrate inference and noUnusedParameters behavior before acceptance; it must not use any/casts to conceal generated errors.

The initial prototype uses const assertions on fresh result literals to infer readonly fields and literal tags. These assertions do not change runtime behavior or mask payload/constraint errors. Copied annotations/constraints retain mappings to their original tokens. Enum declaration, case, payload and type-parameter rename is deliberately withheld, including at references, until linked type/tag edits can be shown complete; constructor completion, hover and diagnostics remain available. This bounded editor scope is accepted; ordinary external type renames remain supported and must update every copied annotation.

Matching initially uses released syntax:

```text
return switch (state) {
  case { kind: 'idle' }: 'Idle';
  case { kind: 'loading' }: 'Loading';
  case { kind: 'loaded', value }: String(value);
  case { kind: 'failed', error }: String(error);
};
```

Adding a case exposes missing expression arms through normal TS narrowing/never checking. A default retains RFC 0010's catch-all behavior; explicit coverage with default remains an optional lint policy. RFC 0016 accepts dedicated match expressions using qualified type-only case descriptors and named native bindings. Case shorthand and contextual `.loaded` remain separate proposed work. Contextual shorthand and broader predicates remain deferred; runtime shape validation is not added.

## Lowering and interoperability

Representative output for a non-generic enum:

```ts
type Status = { readonly kind: 'idle' } | { readonly kind: 'loaded'; readonly value: number };
const Status = {
  idle(): { readonly kind: 'idle' } {
    return { kind: 'idle' };
  },
  loaded(value: number): { readonly kind: 'loaded'; readonly value: number } {
    return { kind: 'loaded', value };
  },
};
```

Export modifiers apply to both generated declarations. Type-only imports consume the alias; value imports consume constructors. Native declarations must describe the union and precise factories without requiring a Twill-only type checker. Normal ESM initialization and function call semantics apply. A factory allocates one result object and performs ordinary argument evaluation exactly once; no runtime module, wrapper class, frozen graph or task is created. Nullary factories also allocate one object per call; object equality is native identity.

Recognition must be token/AST based: generic enum declarations and enum bodies beginning with case followed by a case-name identifier opt into associated-value syntax. A native member named case (assigned or implicit) does not opt in. Plain native enums must still parse through the original parser. The declaration is a lexical binding and follows native top-level/block declaration rules. Generic type annotations may include nested syntax, comments and function/object types; do not parse them using broad regex replacement. JS-only parsing modes cannot accept TS type declarations.

## Compatibility and alternatives

Handwritten unions/factories remain the public baseline. A class-per-case or runtime enum library adds identity/prototype costs without being needed for the initial goal. Reusing native numeric enums would not express payloads. Changing object identity to Swift value equality is excluded and belongs to RFC 0021. Future tag customization needs explicit handling of existing patterns/serialization.

## Validation and completion

- Execute nullary and payload factories; verify exact records, distinct allocation, argument order and reference retention. Compose with nested closures, guard, defer and switch.
- Reject duplicates, reserved tag fields, malformed annotations and unsupported forms at original tokens. Preserve ordinary enum exports, const enums and neighboring JS/TS syntax.
- Check generic inference/defaults/constraints, precise case return types, immutable tags, omitted cases after adding a variant, no-unused settings, mixed TS imports and native declaration consumers.
- Preserve mappings for declaration/case/payload types and usages, completion, hover, rename and diagnostics. Withhold unsafe edits rather than redirecting them to generated text.
- Format without lowering, preserve comments, prove idempotence, map lint rules, and highlight case names/types without losing native TS/TSX scopes.
- Test the extracted VSIX, independent compiler/formatter/linter/highlight packages, build adapters, Node loader and checked source export. Report output size/cost against the handwritten baseline.

## Open questions and decision history

Precise spelling, generic-factory ergonomics and edit mappings require implementation evidence and review. Initial scope is named payload fields plus existing object-pattern switches. Broader matching, custom tags, methods and value equality are intentionally separate proposals. The implementation review accepted this scope after fixing nested infer binding, lexical-body rejection and source-mapped rename safety, and adding runtime/type/declaration/formatter/highlighter regressions. Declaration, case, payload and type-parameter renames remain withheld. PR #13 supplies the implementation; a release/version reference must be recorded before changing the status to Implemented.
