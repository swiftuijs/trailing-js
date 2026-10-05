# Workspace examples

Each example is an independent private pnpm workspace package. All use their own Vite configuration and declare their own dependencies. Build the compiler/tooling once with `pnpm build` before running source-export consumers.

| Package suffix | Purpose                                               | Local entry                                            |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `basic`        | Callbacks, async and multiple closures                | `pnpm --filter @swiftuijs/twill-example-basic dev`     |
| `general`      | Validation, typed outcomes, owned IO and cancellation | `pnpm --filter @swiftuijs/twill-example-general dev`   |
| `defer`        | Resource cleanup                                      | `pnpm --filter @swiftuijs/twill-example-defer dev`     |
| `mixed`        | Two-way native TS/JS imports                          | `pnpm --filter @swiftuijs/twill-example-mixed dev`     |
| `react`        | React and `@swiftuijs/ui` with standard components    | `pnpm --filter @swiftuijs/twill-example-react dev`     |
| `vue`          | Vue lazy slots                                        | `pnpm --filter @swiftuijs/twill-example-vue dev`       |
| `library`      | Vite ESM library plus standard `.d.ts` and maps       | `pnpm --filter @swiftuijs/twill-example-library build` |

Every package exposes `build`, `typecheck`, `lint`, `format`, and `format:check`. Browser packages also expose `preview`; Node examples expose `start` for their built bundle. Root scripts are convenience wrappers. Example formatter/linter commands discover the shared root config, which uses the independently installable tooling packages.

The general example's `workflow.twill` imports domain types from ordinary `workflow-models.ts`. It validates an untrusted ledger, handles expected input failures explicitly and releases its owned document on success, exceptions and cooperative cancellation. Its package-owned execution test uses a real Node file handle as well as injected failure cases. Run `pnpm --filter @swiftuijs/twill-example-general test:example` after building.

## Framework source study

[`react-framework`](./react-framework/README.md) rewrites a pinned React client-core source graph, comparing development/production contracts and compatibility with an existing ReactDOM renderer. It includes output budgets and reproducible build/runtime measurements. It is a source compatibility pilot, not a maintained full React fork or typed Flow-to-TypeScript port.
