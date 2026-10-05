# Twill documentation

Private `@swiftuijs/twill-docs` workspace package. VitePress builds the canonical Markdown under `/docs`; guides are not copied into another content tree. Includes local search, Twill/TSX highlighting, English/Chinese entry guides and a browser-worker playground using the real compiler. VitePress supplies the established documentation theme and navigation.

```sh
pnpm docs:build
pnpm --filter @swiftuijs/twill-docs dev
pnpm docs:preview
```

The default base is `/twill/` for GitHub Pages. Override with `TWILL_DOCS_BASE=/` for root hosting. Static output is `apps/docs/dist`. The CI browser job checks the built site, playground, search and responsive navigation. The Pages workflow is a separate deployment step.

The playground only lowers syntax into TS/TSX. It never executes user code or sends it to a server. A worker, size limit and timeout isolate malformed/slow input. It does not replace project type checking or host emission.

The stable VitePress 1 release originally depends on unpatched Vite 5. A scoped pnpm override selects patched Vite 6.4.3+ (supported by its Vue plugin), validated by builds and browser tests. Docs-local React 18 peers satisfy VitePress's bundled DocSearch dependency; local search does not load DocSearch. Compiler/example packages retain their own Vite 8 and React dependencies.
