# Contributing

Use Node 22.12+ and `npm ci`. Run `npm run check` and `npm run format:check` before submitting changes. `npm run test:watch` supports compiler development; `npm run dev:react` and `npm run dev:vue` run the examples after a build.

For a syntax change, add execution or negative-diagnostic tests covering the new behavior, nearby ordinary JS/TS syntax, and nesting. For mapping changes, check real diagnostic/editor positions. Build integrations must be exercised with their actual tool. Avoid replacing parser behavior with broad string rewrites.

Keep the compiler independent of frameworks and libraries. Put runtime adaptation in an optional entry point, and use example applications for library-specific usage. Update the syntax contract when behavior or compatibility changes.

The editor can be debugged by opening `editors/vscode` in VS Code, running `npm run editor:build` at the repository root, and launching its extension host. Install the built VSIX for packaged validation.
