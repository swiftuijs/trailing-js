# RFC 0036: Optional native subprocess backend evaluation

**Status:** Proposed; evaluation only.
**Kind:** Runtime/tooling.
**Release:** Not implemented or released.
**Dependencies:** RFC 0034, with separate scoped-stream/pipeline ownership acceptance.
**Review:** Authorized evaluation following PR #20; no native-backend acceptance or Rust performance claim.

## Problem and native baseline

The current shell SDK calls native Node spawn/libuv with literal argv. Its Linux/Node 24 warm wall ratios were 1.003–1.013 against equivalent handwritten Node coordination; dual capture consumed about 10% more parent CPU. This leaves limited evidence for replacing ordinary command launches. Existing ownership covers the directly launched child; robust pipelines and operating-system containment require new lifecycle contracts.

Evaluate Rust when it can provide a concrete capability or measured improvement: owning Unix process groups/sessions, Windows Job Objects, pipe descriptors, bounded capture and coordinated pipeline cleanup. Script compiler startup is a different path covered by RFC 0035.

## Proposed design and boundaries

Keep the JavaScript API, TypeScript declarations and Node/npm interoperability. An optional N-API addon is the candidate boundary: one native operation owns an entire command or pipeline through settlement. Prefer existing maintained platform primitives where possible. Do not introduce one Rust helper process per command, per-chunk JS/native promise crossings or implicit alternate backend selection.

Specify backend choice before implementation. Initially benchmark in an isolated, explicitly selected prototype; the existing Node backend remains the implementation and published behavior. A native backend must not silently claim stronger cleanup than an available fallback. Absence of a prebuilt binary is an explicit unavailable-backend condition, not an automatic install-time compiler or download.

Native owned resources include child handles, pipe descriptors, containment handles, timers and readers. Success/rejection occurs after ownership is released and the specified join completes. Partial pipeline launch or connection failure tears down every launched stage. Preserve first failure, attach structured cleanup failures, and report unresolved owned children. A group/job is an ownership boundary, not a security sandbox: detached/escaped Unix descendants may leave a group; Windows restrictions and breakaway policy must be specified and tested. Rust ownership alone cannot establish cancellation correctness.

Keep literal argv, `shell: false`, explicit cwd/environment, byte bounds, status/error contracts and native evaluation order. Never infer shell grammar, mutate parent globals or log secrets. Streaming/backpressure and unread-output cleanup require the independent scoped/pipeline contract. Returned buffers have explicit lifetime/ownership; distinguish an external Node buffer from a real zero-copy guarantee and account for retained memory. Rust panics must not cross the ABI; document unrecoverable native faults.

## Costs, interoperability and delivery

N-API reduces Node/V8 ABI churn; OS/CPU/libc prebuilds, native packaging, Windows/macOS support and native crash risk remain. Keep native artifacts in a separate optional package with its own justified byte budget; do not relax the current zero-production-dependency SDK's 16 KiB archive gate. No parser/checker/formatter/highlight extension or compiler-inserted import is required. Preserve the browser/compiler runtime boundary.

A standalone Rust interpreter, embedded alternate JS engine or wholesale language/compiler port would change Node compatibility and requires a separate language/runtime decision. A launcher retaining Node and the current TypeScript loader still pays their initialization costs.

## Evaluation and acceptance gates

Before a production implementation, choose one target workload/capability and compare the actual Rust/N-API prototype with the existing SDK and equivalent native Node coordination. Retain all samples and exact source/build/toolchain identities. Measure cold import/startup, inherited-descriptor launch, bounded dual capture, large stdin, pipeline throughput, parent CPU, RSS, cancellation latency and native artifact bytes independently. Report child work separately; no faster-external-command claim.

Performance acceptance retains RFC 0034's wall-time tolerance and requires a reproducible improvement in the chosen bottleneck, or a demonstrated capability unavailable through the existing backend at justified overhead. An inconclusive result is not adoption evidence. Run real Linux/macOS/Windows ownership tests: partial launch, pipeline failures/SIGPIPE, concurrent streams, cancellation races, descriptor-retaining descendants, group escape, Job Object restrictions, deadlines and unreaped handles. Preserve exactly-once settlement and primary/secondary errors. Existing JS/TS/Twill and independently installed Node 20 consumers must use the same contract suite.

## Decision and next milestone

Proceed with startup profiling/cache first. Keep the current SDK backend. The next native milestone is an isolated ownership/pipeline experiment after the public scoped/pipeline contract is accepted; do not add Rust to production dependencies on the basis of language preference or the current small warm-wall differences. Synchronize docs and the official skill only with capabilities actually implemented and tested. No Rust improvement has been measured.
