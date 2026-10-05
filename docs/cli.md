# CLI reference

The locally installed `@swiftuijs/twill` package provides the `twill` command. Run these commands from your application root; examples use `pnpm exec`, with equivalent npm or Yarn invocation available.

```sh
pnpm exec twill --help
```

Your normal `tsconfig.json` supplies project types and JSX settings. Commands work without `twill.config.json`; its optional `implicitReturn` setting is only needed when deliberately changing that language behavior.

## Check types

```sh
pnpm exec twill check -p tsconfig.json
pnpm exec twill check -p tsconfig.json --json
```

Checks one configured mixed TS/JS/Twill project and maps diagnostics to original source. It proves switch-expression exhaustiveness using the existing TS type system. Native `tsc` cannot parse Twill source; a successful bundler build is not a substitute for this check.

`-p` / `--project` selects the tsconfig, defaulting to `tsconfig.json` in the current directory. `--json` writes the diagnostic array to standard output. Errors produce exit status 1; a successful check returns 0. This command performs a single check, without a watch loop or referenced-project build.

## Inspect project diagnostics

```sh
pnpm exec twill doctor -p tsconfig.json
pnpm exec twill doctor -p tsconfig.json --json
```

Reports compiler/checker/Node versions, project configuration, source counts and diagnostics. JSON provides the complete structured report. Errors produce a nonzero status. Reports include filenames and diagnostic text; review them before sharing.

Use this when editor types, source discovery or project settings differ from your expectations. The [editor guide](./tooling.md) describes the corresponding VS Code command.

## Compile one file

```sh
pnpm exec twill compile src/service.twill
pnpm exec twill compile src/service.twill -o generated/service.ts
pnpm exec twill compile src/service.twill --js -o generated/service.js
```

The default preserves TS types and lowers Twill syntax to native TS/TSX. `--js` also erases types and lowers JSX. Without `-o`, code goes to standard output. With `-o` / `--out`, it writes code plus an adjacent map, such as `generated/service.ts.map`; output must differ from input.

`-p` / `--project` can select a tsconfig for the compilation's project/JSX settings. Without it, configuration is read from the current directory. This command performs syntax emission, not project type checking.

Single-file compilation preserves import specifiers. Use a [build adapter](./build-tools.md) for an application's module graph, or [source export](./adoption.md#export-back-to-native-ts) when converting the project to native TS/TSX.

## Emit library declarations

```sh
pnpm exec twill declarations -p tsconfig.json -o dist
pnpm exec twill declarations -p tsconfig.json --build --json
```

Emits `.d.ts` and declaration maps from a checked source project. It does not emit application JS; combine it with your bundler's library build.

- `-p` / `--project`: root tsconfig; defaults to `tsconfig.json`.
- `-o` / `--out`: root project's declaration output directory, relative to the current directory.
- `--build`: visits referenced declaration projects in dependency order.
- `--json`: reports emitted files, projects and diagnostics as structured output.

Errors prevent writes for the failing project and return a nonzero status. Earlier successfully emitted dependencies remain on disk. Circular references fail explicitly. This is a full declaration build without incremental `.tsbuildinfo`.

See [libraries and declarations](./libraries.md) for the build and package configuration consumers need.

## Source migration is a separate tool

The optional `@swiftuijs/twill-migrate` package supplies `twill-migrate`. It exports a checked graph to a **new directory**, rewrites relative dialect imports and preserves originals. It is not a `twill compile` mode. See [adoption and migration](./adoption.md).
