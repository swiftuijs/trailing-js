# RFC 0019: Explicit typed error propagation

**Status:** Proposed. **Kind:** Language. **Release:** Not released.
**Dependencies:** Checker/declaration metadata; 0015 for an optional Result representation.

## Problem and native baseline

JS function signatures omit expected thrown failures. Callers cannot tell whether they must handle a business error, and catch values are unknown. Compare a discriminated Result union and explicit try/catch with a declared effect such as `function load(): Data throws(NetworkError)` and an explicit `try load()` call.

## Design

Spelling is exploratory. Distinguish declared expected failures from arbitrary JS exceptions and cancellation. A checked Twill function may declare a failure type; checked calls must handle or propagate that effect explicitly. Define inference for callbacks, overloads, generics, async rejection and rethrows-like higher-order functions before claiming coverage. Catch narrows declared errors only where the compiler can prove the origin; external exceptions retain an unknown channel.

Native JS/TS dependencies can throw anything even with a normal return signature. An adapter may validate/translate specific errors; it cannot assert all other exceptions are impossible. No implicit `try?` catch-all converts exceptions/cancellation into undefined. Explicit handling must decide whether cancellation propagates.

## Lowering and interoperability

Runtime behavior should remain ordinary calls/throws or explicit Result records. A full design must choose one model rather than mixing them invisibly. Standard .d.ts cannot directly express checked throws, so define sidecar/effect metadata and native-consumer fallback, including metadata versioning and export. Async error effects must not add promise wrapping or swallow rejection. Native callers keep normal exception behavior.

## Compatibility and alternatives

Native Result unions/libraries and try/catch are valid baselines. An annotation-only spelling without call-site enforcement is insufficient for the proposed guarantee. Changing all JS exceptions to typed failures would require a new runtime boundary and is not assumed.

## Validation and completion

Demonstrate propagation through direct and callback calls, overloads, mixed files, async chains, unknown third-party throws, cancellation and defer cleanup precedence. Require real editor call/catch diagnostics, declaration round trips, metadata consumers, formatter/linter/highlighting support and measured runtime parity.

## Open questions and decision history

Resolve exception versus Result representation, effect metadata and unknown-channel rules before implementation. This proposal is not a released checker guarantee.
