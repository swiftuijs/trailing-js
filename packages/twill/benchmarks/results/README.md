# Executable-script startup measurements

`runner-linux-node24.json` records 15 alternating paired launches of fresh Node processes executing identical Twill source, comparing the published-style Node loader invocation with the new direct `twill` binary. No subprocess SDK or external command is part of this workload. Every sample is retained; the report identifies the source commit, entry source hash, runtime/build entry hashes, exact commands and environment.

On this Linux/Node 24 machine, cold medians were 520.8 ms for the loader and 475.0 ms for the runner. The median paired runner/loader ratio was 0.915, with a deterministic paired-bootstrap 95% interval of 0.734–0.953. These observations show no added startup regression in this sample, not a portable speedup or parity with native Node. Both paths include source compilation. Original source/build identities are available at commit `e25166574e22b8a1c2a415876185712e590847a9`.

Reproduce after building the compiler, on an otherwise idle machine:

```sh
pnpm --filter @swiftuijs/twill build
node packages/twill/benchmarks/runner.mjs > runner-results.json
```

The runner dispatches before importing compile/check/export tooling and executes the script in the same Node process. Functional tests verify that its PID matches the launched interpreter, rather than relying on timing to prove there is no intermediary child. Warm subprocess execution and capture-memory comparisons belong to the separate shell SDK benchmark; these startup samples do not alter those results.
