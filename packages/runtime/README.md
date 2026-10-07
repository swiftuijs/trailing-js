# <img src="https://twill.evecalm.com/logo.png" alt="Twill hummingbird" align="right" width="40" height="40" /> Twill runtime

Optional, zero-dependency helpers for Twill, a TypeScript-based language with Swift-inspired syntax. This package is an unreleased RFC 0032 prototype. Released Twill 0.1.2 does not support the external runtime option yet.

The compiler defaults to self-contained inline code. The prototype's external mode shares dynamic synchronous `defer` draining across modules:

```sh
pnpm add @swiftuijs/twill-runtime
```

```json
{
  "runtime": "external"
}
```

Put that option in `twill.config.json`, or use `twill({ runtime: 'external' })` in a build adapter. Install the runtime as a production dependency of applications and published libraries whose compiled code imports it. Inline-only output needs no runtime installation.

The compiler emits a hygienic named import from `@swiftuijs/twill-runtime/helpers/v1`. That subpath is a versioned compiler/helper ABI; applications normally use Twill syntax instead of calling helpers directly. ABI v1 preserves reverse cleanup order, runs every callback after failures and rethrows the last cleanup failure, including `undefined`. It is synchronous and ignores callback return values.

Single directly registered cleanup retains its native fast path. Explicit async or mixed cleanup stays inline to preserve scheduling. Guards, arrows, enum factories/matching and ordinary component output gain no runtime import. Only modules needing the helper import it; exports have no side effects, and bundlers can tree-shake unused helpers. There is no compiler, TypeScript engine, UI framework or Node-only API in the runtime.

Sharing reduces repeated uncompressed code but retains cleanup callback and array allocation. It is not a general speedup promise; gzip may already compress repeated inline code. See [performance](https://twill.evecalm.com/performance), [Twill documentation](https://twill.evecalm.com/) and [RFC 0032](https://github.com/swiftuijs/twill/blob/main/docs/rfcs/0032-optional-runtime-helpers.md). Twill's sibling UI project is [SwiftUI.js](https://swiftuijs.evecalm.com/).
