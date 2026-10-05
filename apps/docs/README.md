# Twill documentation

Private `@swiftuijs/twill-docs` workspace package. VitePress builds the canonical Markdown under `/docs`; guides are not copied into another content tree. Includes local search, Twill/TSX highlighting, English guides and a browser-worker playground using the real compiler. VitePress supplies the established documentation theme and navigation.

```sh
pnpm docs:build
pnpm --filter @swiftuijs/twill-docs dev
pnpm docs:preview
```

The default base is `/twill/` for GitHub Pages. Override with `TWILL_DOCS_BASE=/` for root hosting. Static output is `apps/docs/dist`. The CI browser job checks the built site, playground, search and responsive navigation. The Pages workflow is a separate deployment step.

The playground only lowers syntax into TS/TSX. It never executes user code or sends it to a server. A reusable worker, size limit and per-compilation timeout isolate malformed/slow input. CodeMirror supplies TS/JSX highlighting, contextual Twill keywords, keyboard editing and inline errors. Input compiles automatically after a short debounce; drafts stay in local storage. It does not replace project type checking or host emission.

VitePress uses a scoped Vite 6.4.3 override, validated by builds and browser tests. Docs-local React 18 peers satisfy VitePress's bundled DocSearch dependency; local search does not load DocSearch. Compiler/example packages retain their own Vite 8 and React dependencies.

Generated output is formatted through the same formatter API used by the VSIX viewer. Formatting runs in the compiler worker and its time is included in the displayed duration. Build and checker source maps remain attached to the unformatted compiler result.
