# RFC 0032: Optional runtime helpers

**Release reference:** 0.2.0 implements the accepted scope; broader/deferred items below remain proposals.
**Status:** Implemented in 0.2.0 for the accepted scope; deferred capabilities remain proposals.
**Kind:** Tooling and runtime. **Dependencies:** 0009, 0026, 0027, 0028.

Implementation prototype: [PR #15](https://github.com/swiftuijs/twill/pull/15), stacked on the native switch-initializer optimization in [PR #14](https://github.com/swiftuijs/twill/pull/14).

## Problem and native baseline

Dynamic synchronous `defer` scopes repeat reverse-order stack draining and cleanup-failure replacement. A shared native function can centralize that algorithm across application modules, improve emitted readability and reduce uncompressed code. Single cleanup, guards, native enum factories/matching and component children already have useful native fast paths. Sharing must not add wrappers to those paths or imply that source brevity makes execution faster.

## Design

Add `runtime: "inline" | "external"` to TransformOptions, build plugin options and twill.config.json. Default remains inline; reject other values. Configuration is consumed consistently by compile/check, declarations, source export, loader and editor projects. CLI `compile --runtime` can override configuration for one emission; checking and declaration/export commands use project configuration so their virtual program agrees with the emitted code.

The first external helper is `runDefers`, exported by the zero-dependency ESM package `@swiftuijs/twill-runtime/helpers/v1`. Only modules containing dynamic synchronous cleanup import it. Generated import aliases and storage names are hygienic. Static imports use the host's normal package resolver; no virtual module, remote URL, process global registry or prototype modification is introduced. Explicit script-mode sources requiring that helper receive a diagnostic rather than invalid import syntax.

The versioned subpath identifies the compiler/helper ABI. Compatible releases retain its contract. An incompatible algorithm/protocol uses a new subpath; package ranges do not redefine an existing ABI silently. Applications and published libraries using external emission declare the runtime as a production dependency. Inline-only output needs no runtime package. The compiler itself does not acquire a runtime package dependency.

## Semantics and emission

Scope lifetime, registration and cleanup closures remain in the source's lexical scope. `try/finally` continues to handle return, throw, break/continue and generator close. A lazy array records reached registrations. The helper drains in reverse order, executes every cleanup despite failure and throws the last cleanup failure, including `undefined`, replacing an earlier body/cleanup failure. It returns synchronously and never awaits a callback's return value.

```js
import { runDefers as __twillRunDefers } from '@swiftuijs/twill-runtime/helpers/v1';
let __twillDefers;
try {
  (__twillDefers ??= []).push(() => release(resource));
  // More registrations and original statements.
} finally {
  __twillRunDefers(__twillDefers);
}
```

A single directly registered cleanup keeps the existing callback/finally fast path. Scopes with any explicit awaited cleanup retain their existing inline lowering in both modes. Moving asynchronous draining into a Promise-returning helper can add microtask turns; that needs separate semantic design and is deferred. External mode can therefore contain inline async cleanup and generates no import if all scopes use fast/async paths.

The runtime helper is the canonical algorithm source. Build-time generation derives the compiler's hygienic inline body from that source; release checks reject stale generation. The compiler's shipped build contains that body and requires no runtime package during compilation. Native TS checks source-local types and narrowing; helper types do not escape public declaration output. Existing mappings retain original statements, bindings and cleanup expressions.

## Costs and performance acceptance

Compare synchronous external output against inline output and equivalent handwritten code with the same registrations, closures, reverse order and exception contract. A minimal single native finally is useful as an allocation floor but is not an equivalent dynamic-stack baseline. Sharing retains callback/array allocation and adds one function call per dynamic scope. It is not automatically faster.

Measure minified bytes, gzip, helper inclusion/tree shaking, repeated modules, isolated warmed execution, cold first call and build/check costs. Include helper bytes in totals. Multiple split chunks, host/runtime versions and actual applications can differ. Record inputs, checksums, source/build identity and all trials; do not cherry-pick favorable timing samples. Native control flow is the default performance baseline. Fix structural overhead such as avoidable switch IIFEs independently of runtime packaging; sharing callbacks does not fix it.

Deterministic CI gates require semantic parity, zero imports for unused/fast paths, one helper import per needed module, no compiler/framework dependencies in application graphs, unchanged async scheduling and small package/application budgets. Timing comparisons must be reproducible and reviewed; noisy machine timing is not a portable language speed guarantee. A material repeatable slowdown blocks expanding or making external mode the default.

Representative optimized paths target a wall-clock median within 10% of an equivalent native implementation on a controlled host. `benchmark:runtime --verify-performance` rejects a ratio above 1.10× and writes the complete report before failing. Preserve failures and investigate sampling, preheating, process/CPU variation and generated code; do not discard unfavorable trials. The prototype records both wall and process CPU samples. Acceptance of a measured path does not imply that dynamic registration beats minimal allocation-free finally.

## Tooling, compatibility and validation

Keep both configuration schemas identical and use the common option throughout adapters, loader, checker/editor, CLI and exports. Playground defaults to inline and its standalone output remains dependency-free. Document external export installation instead of silently copying packages or changing project manifests. Published declarations remain native TS and do not require the runtime merely to consume their types.

Test inline/external differential behavior for fallthrough, early return, body failure, multiple cleanup failures, thrown undefined, unreached/conditional/repeated/nested registrations, TDZ/live captures, generators, and lexical this/arguments/super/new.target. Test explicit async and mixed scopes retain their scheduling. Verify types, mapped diagnostics/rename, formatting/linting, Node and browser/bundler consumers, checked native export and independent packed installation. Include the new package in release metadata, archive budgets and CI artifact/consumer validation.

## Alternatives and deferred work

Mandatory runtime would make independent script/export adoption harder. Automatic mode selection would make dependency changes implicit. A third project-emitted shared-helper mode adds another resolver/export contract and is deferred until application measurements justify it. User-facing resource/concurrency APIs need their own RFCs; this helper package is not a duplicate standard library. Async cleanup sharing, task groups and cancellation are outside this prototype.

## Decision history

The maintainer authorized this prototype and required native-comparable runtime performance. RFC acceptance, release and any change of default remain separate review decisions.
