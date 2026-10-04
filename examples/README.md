# Workspace examples

Each example is an independent private pnpm workspace package. All use their own Vite configuration and declare their own dependencies. Build the compiler/tooling once with `pnpm build` before running source-export consumers.

| Package suffix | Purpose                                            | Local entry                                            |
| -------------- | -------------------------------------------------- | ------------------------------------------------------ |
| `basic`        | Callbacks, async and multiple closures             | `pnpm --filter @swiftuijs/twill-example-basic dev`     |
| `general`      | Non-UI validation, guards and data processing      | `pnpm --filter @swiftuijs/twill-example-general dev`   |
| `defer`        | Resource cleanup                                   | `pnpm --filter @swiftuijs/twill-example-defer dev`     |
| `mixed`        | Two-way native TS/JS imports                       | `pnpm --filter @swiftuijs/twill-example-mixed dev`     |
| `react`        | React and `@swiftuijs/ui` with standard components | `pnpm --filter @swiftuijs/twill-example-react dev`     |
| `vue`          | Vue lazy slots                                     | `pnpm --filter @swiftuijs/twill-example-vue dev`       |
| `library`      | Vite ESM library plus standard `.d.ts` and maps    | `pnpm --filter @swiftuijs/twill-example-library build` |

Every package exposes `build`, `typecheck`, `lint`, `format`, and `format:check`. Browser packages also expose `preview`; Node examples expose `start` for their built bundle. Root scripts are convenience wrappers. Example formatter/linter commands discover the shared root config, which uses the independently installable tooling packages.
