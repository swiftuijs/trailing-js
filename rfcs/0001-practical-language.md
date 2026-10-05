# RFC 0001: Practical language direction

**Status: Draft.** This document proposes product priorities and acceptance criteria. Candidate syntax below is not implemented and is not a language specification. The public [language guide](../docs/language.md) and [syntax contract](../docs/syntax.md) describe shipped behavior.

## Problem and product promise

Twill should make ordinary JS/TS work easier to understand and harder to get wrong. Importing Swift's surface syntax is insufficient: TypeScript already provides many of the underlying capabilities, and every dialect feature adds installation, editor and maintenance costs.

The useful promise is: **make validation, resource lifetimes and business-state handling explicit, while keeping TypeScript's type system and the JavaScript ecosystem**. Backend workflows and libraries are as important as components. The first audience is teams already using TypeScript who repeatedly deal with nullable data, owned resources and asynchronous outcomes; a Swift background is optional.

Three tasks anchor the evaluation:

1. Read untrusted input, validate it and continue with narrowed types without deeply nesting the successful path.
2. Acquire a resource and visibly release it on every exit, including awaited failures and cancellation.
3. Add a business-state variant and discover which handlers are now incomplete.

The [ledger workflow](../examples/general/workflow.twill) exercises all three using current syntax and ordinary TS domain types. Its executable tests are in the owning example package. These examples demonstrate behavior; they do not establish adoption or universal performance claims.

## Borrow the benefit, choose the native mechanism

| Swift idea                                            | Twill direction                                                                                                                                | Priority / status                                                      |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Early exit and optional binding                       | Existing `guard` / `guard const`; consider destructured optional bindings with explicit nullish semantics                                      | Current foundation; small syntax candidate next                        |
| Enums with associated values                          | Ordinary TS discriminated unions, native narrowing and existing result libraries                                                               | Usable now; no new enum runtime or parallel type system                |
| Exhaustive branching                                  | Type-aware ESLint checks native switches, even with a default; evaluate expression matching only if it offers a substantial additional benefit | Lint available; expression syntax is research                          |
| Branch-scoped optional binding (`if let`)             | Consider an explicit immutable branch binding, without changing JS `let`                                                                       | Lower-priority candidate; spelling undecided                           |
| Immutable data discipline                             | Native `const`, `readonly`, readonly collections and application-specific validation                                                           | Usable now; no hidden freezing or copying                              |
| Typed failures                                        | Local TS unions or normal libraries for expected failures; exceptions retain JS propagation                                                    | Usable now; no blanket exception-to-null conversion                    |
| Structured concurrency                                | Explicit `AbortSignal`, ownership and normal library APIs                                                                                      | Patterns now; task groups require separate evidence and runtime design |
| Property wrappers, observation, macros and decorators | Prefer explicit calls and framework APIs; hidden effects must justify their own semantics and tooling                                          | No automatic port; high scrutiny                                       |
| Struct copying, actors and ownership enforcement      | Would change identity, scheduling or the semantic system                                                                                       | Outside the baseline                                                   |

This is a prioritization proposal, not a commitment to implement every row. New syntax should beat equivalent native TS in a specific task. Reducing punctuation alone does not justify weakening inference, source positions or interoperability.

## Candidate: destructured guard bindings

Optional object results occur in handlers and services. The current explicit form is:

```twill
guard const account = findAccount(id) else { return undefined; }
const { name, plan } = account;
return { name, plan };
```

A possible extension would combine the nullish test and destructuring:

```text
// Candidate only: not accepted by the current compiler.
guard const { name, plan } = findAccount(id) else { return undefined; }
return { name, plan };
```

Its intended lowering would evaluate the whole initializer once, test the whole value for null/undefined and destructure only after the exiting branch. It must not test individual fields for truthiness, allocate wrapper objects, or imply that an untrusted object has been validated. Missing properties, getters and default expressions should follow native destructuring behavior.

A focused syntax RFC must settle failure-branch name visibility, initializer name resolution, temporary-name hygiene, nested/rest/default patterns, annotations, narrowing and mapped edits before implementation. Reordering bindings can change temporal dead zones or shadowing; a plausible text rewrite is not enough. Do not introduce new meanings for JS `let` or require configuration to recognize a declaration.

## Exhaustiveness before new matching syntax

Native TS unions already provide payload typing. The opt-in `recommendedTypeChecked` linter configuration enables `@typescript-eslint/switch-exhaustiveness-check` with `considerDefaultExhaustiveForUnions: false`. Adding a variant exposes missing cases in Twill and ordinary TS files. This is a lint guarantee only when linting is run, not a guarantee of transpilation or the compiler alone.

A future match/switch expression needs a separate case demonstrating why native `switch` plus this check is insufficient. Its contract must specify subject evaluation exactly once, branch laziness, narrowing, exhaustiveness, scopes, side effects and interactions with `await`, `yield`, returns and loop exits. Do not hide an async IIFE or promise conversion behind an expression or pretend a transpile-only build can prove all external types. No keyword or final grammar is selected here.

## Error handling and concurrency stay honest

Expected failures and unexpected exceptions serve different purposes. A validation result can be a local TS union; third-party IO failures and cancellation need an explicit propagation policy. A Swift-like `try?` port that catches everything and returns undefined would hide programming faults and cancellation. Typed `throws` cannot silently promise that arbitrary JS dependencies never throw another value.

The workflow uses integer cents with explicit validation and overflow checks, owns its acquired document, awaits its cleanup and checks cancellation boundaries. Its checks do not interrupt pending IO. Actual interruption needs cooperation from the IO adapter. Standard `using` and `await using` should remain available through the existing TS pipeline when supported; Twill should not create a competing disposal protocol.

Task groups, actors or resource ownership enforcement would require new runtime and lifetime rules. Evaluate an ordinary library first. Any future language feature must specify cancellation propagation, child completion, error aggregation, concurrency limits and cleanup before it is advertised as safer.

## Decorators and hidden effects

Do not reproduce SwiftUI wrappers as compiler-controlled state. React hooks, Vue tracking and ordinary JS property identity already have lifecycle contracts. Implicit observation, dependency injection, retry, disposal or concurrency can obscure when work happens and which component owns it.

This is not a blanket prohibition on standard decorators or user libraries. Native APIs keep their own semantics. A Twill-specific decorator, property wrapper or macro needs an independently justified use case, discoverable generated behavior, explicit cost and complete editor support. It should not become the default mechanism for validation, ownership or business flow.

## Adoption is part of language design

A readable feature is not useful if the editor loses inference or the project cannot gradually adopt it. Keep two-way TS/JS imports, normal framework types, optional configuration and one-file opt-in. Do not add component registries, mandatory runtime wrappers or a duplicate standard library.

Before expanding the grammar substantially, prioritize reliable incomplete-input assistance, safe mapped edits, references/refactoring coverage and realistic project performance. Current support and remaining boundaries stay in [readiness](../docs/readiness.md); this proposal does not claim those gaps are already closed.

The optional `@swiftuijs/twill-migrate` tool exports a checked single-project source graph to formatted native TS, rewrites relative dialect imports and preserves originals. Its boundaries are documented in the migration package: application installation, project references and computed runtime paths need separate handling. The single-file `twill compile` command still preserves import specifiers. Broader project export and refactoring coverage remain adoption priorities.

## Feature acceptance gate

Each new language feature needs:

- A recurring real task, before/after examples and a native TS or library alternative. Explain which error or maintenance burden it removes.
- A complete lowering and scope/error/evaluation-order contract. Standard JS keywords and valid existing syntax keep their meaning.
- Compiler execution and negative tests, nesting and adjacent native syntax tests; a failure must be a diagnostic rather than silent guessing.
- Type inference, diagnostic mapping, formatter idempotence, lint positions/fix safety, highlighting and packaged editor behavior, including incomplete input and mixed native files.
- Actual build/Node/framework validation as relevant, with no application-library special cases.
- Build/editor measurements and runtime comparisons against equivalent natural handwritten code. Count extra closures, arrays, copies and scheduling; do not manufacture an inflated baseline to claim zero overhead.
- Updated public syntax documentation that distinguishes supported behavior from proposals.

No feature is complete when only the parser accepts it. There is no target number of Swift features.

## Validation and sequence

1. Establish practical patterns, an executable non-UI workflow and opt-in exhaustive linting using current types and syntax.
2. Specify and review the narrow destructured-guard candidate; implement it only with the full acceptance gate.
3. Address adoption costs and export/refactoring gaps before a broader expression-matching experiment.
4. Pilot in a few real backend and component projects. Compare equivalent TS/Twill tasks: understanding control flow, extending a state union, diagnosing failures and managing resources. Track setup effort, editor failures, build/editor latency and generated runtime behavior on the same hardware and project.

Fewer lines are insufficient evidence. Look for clearer reviews, omissions discovered before execution, correct failure/cleanup behavior and an easy route back to native TS. Small pilots supply feedback rather than proof of universal productivity. A stable production claim also needs the existing release and support criteria, not just a successful demo.

## Primary references

- Swift [Control Flow](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/controlflow/): optional binding, early exit, switch and pattern matching.
- Swift [Enumerations](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/enumerations/): associated values and exhaustive switches.
- Swift [Error Handling](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/errorhandling/): propagation, cleanup and optional error handling.
- Swift [Concurrency](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/): task lifetimes and cooperative cancellation.
- Swift [Properties](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/properties/) and [Macros](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/macros/): wrappers and generated behavior.

These motivate questions; JS/TS semantics and the acceptance gate determine Twill's answers.
