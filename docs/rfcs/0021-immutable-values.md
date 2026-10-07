# RFC 0021: Immutable records and value semantics

**Status:** Proposed. **Kind:** Language and possibly runtime. **Release:** Not released.
**Dependencies:** None.

## Problem and native baseline

Const prevents rebinding but does not protect an object graph. Shared mutable state can make a seemingly local update affect unrelated consumers. TS readonly records plus explicit copies are the current baseline.

## Design

Treat checked immutable records and copying/value semantics as distinct milestones. An initial record type may reject writes through all checked Twill aliases and provide explicit copy-with-update construction. Specify shallow versus deep immutability, nested mutable payloads, collections, cycles, getters, classes and external aliases. Readonly annotations alone cannot prove an external JS alias will not mutate a value.

True value semantics additionally need an identity/equality/copy contract. Do not silently replace native object equality or copy every assignment. Any chosen record syntax must explain when copies occur and whether equality is structural, including cycles and NaN. Mutable escape/adapters must be visible and cannot retroactively make native objects immutable.

## Lowering and interoperability

Static-only records can emit readonly TS shapes and explicit object copies, with clearly limited guarantees. Runtime freezing or persistent structures require an explicit runtime and disclosure of traversals/allocations. Native JS boundaries must either validate/snapshot inputs or retain a documented weaker guarantee. .d.ts describes the structural surface and cannot prove alias isolation by itself.

## Compatibility and alternatives

Native readonly/ReadonlyArray, explicit spread updates and application immutable libraries are baselines. Swift's struct copying cannot be assumed equivalent to JS object identity. Changing native let/const defaults is a separately versioned decision.

## Validation and completion

Test alias mutation, nested payloads, casts/native escapes, getters, cycles, equality, updates and serialization. Measure allocations and update latency for realistic graphs. Require checker/declaration evidence, diagnostic mappings and packaged tooling before advertising an immutability guarantee.

## Open questions and decision history

Select the guarantee (checked shallow records, runtime immutability or full value semantics) before choosing syntax. None is implemented by this proposal.
