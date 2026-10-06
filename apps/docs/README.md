# Twill documentation

Private `@swiftuijs/twill-docs` workspace package. VitePress builds the canonical Markdown under `/docs`; guides are not copied into another content tree. Published navigation is for language users. `docs/contributing/**` and `docs/rfcs/**` remain repository documentation and are excluded from site pages, local search and the sitemap. Includes local search, Twill/TSX highlighting, English guides and a browser-worker playground using the real compiler. VitePress supplies search, navigation and reference-page layout. The custom home page explains product value through build-time highlighted TS/Twill comparisons and a keyboard-accessible tab interface. Home and playground components load only on their respective routes; the compiler worker and CodeMirror load only in the playground.

```sh
pnpm docs:build
pnpm --filter @swiftuijs/twill-docs dev
pnpm docs:preview
```

The canonical site is `https://twill.evecalm.com`, hosted on GitHub Pages at the root path `/`. Set `TWILL_DOCS_BASE` when hosting under another path. Static output is `apps/docs/dist`. The CI browser job checks the built site, playground, search and responsive navigation. The Pages workflow is a separate deployment step. See the [domain configuration](../../docs/contributing/releasing.md#documentation-domain) for DNS and repository settings.

The playground only lowers syntax into TS/TSX. It never executes user code or sends it to a server. A reusable worker, size limit and per-compilation timeout isolate malformed/slow input. CodeMirror supplies TS/JSX highlighting, contextual Twill keywords, keyboard editing and inline errors. Input compiles automatically after a short debounce; drafts stay in local storage. It does not replace project type checking or host emission.

VitePress uses a scoped Vite 6.4.3 override, validated by builds and browser tests. Docs-local React 18 peers satisfy VitePress's bundled DocSearch dependency; local search does not load DocSearch. Compiler/example packages retain their own Vite 8 and React dependencies.

Generated output is formatted through the same formatter API used by the VSIX viewer. Formatting runs in the compiler worker and its time is included in the displayed duration. Build and checker source maps remain attached to the unformatted compiler result.
