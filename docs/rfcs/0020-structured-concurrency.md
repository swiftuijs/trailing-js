# RFC 0020: Structured concurrency

**Status:** Proposed. **Kind:** Language and optional runtime. **Release:** Not released.
**Dependencies:** Error and cleanup contracts; a library/runtime prototype.

## Problem and native baseline

Promise.all starts tasks but does not establish cancellation ownership or wait for siblings after one rejects. Manual AbortController and settlement handling is easy to omit. A task scope should own children and define how they finish.

## Design

Prototype an ordinary task-group API before selecting syntax. Every child belongs to an explicit group. Exiting normally, throwing, returning or cancelling waits for all started children to settle. A child failure requests cancellation of siblings; the group still joins them before it closes. Specify first-error versus aggregate-error reporting, parent/child cancellation propagation, concurrency bounds, task registration after closure and nested groups.

Cancellation is cooperative through AbortSignal or an explicit adapter. Requesting cancellation cannot terminate an arbitrary JS promise; joining a noncooperating child may remain pending. Do not promise interruption or CPU parallelism. A group must not discard failures or let children escape through an unnoticed detached mode. Explicit detached tasks, if added, need their own ownership/error contract.

## Lowering and interoperability

This feature needs an explicit runtime for task state, cancellation and settlement. Count controllers, promises, queues and scheduling. Integrate with existing async APIs through signals; ordinary promises remain native promises. Scope cleanup follows joining, unless a reviewed resource contract requires an earlier cancellation step. Never add automatic parallelism to ordinary await or loops.

## Compatibility and alternatives

Promise.all/Promise.allSettled and explicit controllers are baselines. A convenience syntax without reliable joining does not solve the problem. Actors, workers and distributed tasks are separate proposals.

## Validation and completion

Test sibling failures before/after cancellation, parent abort, nested groups, bounded concurrency, noncooperating tasks, synchronous throws, cleanup errors and registration races. Use deterministic scheduling controls and real IO adapters. Verify runtime packaging, type inference, editor/format/lint support and overhead against a correctly joined native baseline.

## Open questions and decision history

Choose failure aggregation, cancellation result type and an explicit runtime API before language syntax. No structured-concurrency runtime is currently shipped.
