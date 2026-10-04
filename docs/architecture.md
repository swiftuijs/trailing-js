# Architecture

`src/parser.js` extends Acorn's expression parser and delegates JS, TS, JSX, function scopes, and control flow to its normal parsers. A tokenized lookahead recognizes only the optional `parameters in` header. Acorn's arrow-function scope implementation validates parameter bindings and permits return/await. TS extension backtracking is accounted for by retaining only closures reachable in the final AST.

`src/compiler.ts` edits original offsets with MagicString. It preserves comments, whitespace, ordinary syntax, and original parameter tokens. Moving a closing parenthesis around the closure avoids regeneration of the rest of the file. Explicit builders use hygienic collectors and visit statement scopes without descending into nested functions or classes. Maps contain the original source text and token-level positions.

`src/transpile.ts` erases TS types and lowers JSX with TypeScript, then composes its map with the syntax map. The unplugin adapters share this pipeline. Compiler users can keep TypeScript intact by calling `transform()` directly. The optional Node loader uses the same lowering pipeline.

`src/project.ts` presents virtual standard filenames to a TypeScript language service. Discovery follows tsconfig includes/excludes; module resolution delegates to TypeScript first and then checks local trailing files. Source snapshots are lowered before TypeScript sees them. Diagnostics and editor spans map between original and generated offsets. Overlay changes invalidate versions across dependent files. The CLI uses strict parsing; the editor can repair a small number of common incomplete inputs for assistance while still reporting strict syntax errors.

`src/react.ts` and `src/vue.ts` are runtime helpers, independent of the compiler. React creates elements and eagerly constructs children during the parent's render; Vue supplies a lazy default slot. User libraries are normal arguments to these helpers. The main compiler entry does not load either framework.

The VS Code extension bundles TypeScript and the compiler into its extension host bundle, uses standard language providers, and reads the same JSON configuration as builds. TextMate grammars delegate normal language regions to VS Code's bundled TS/JS grammars. No user application code or executable configuration is run by the editor.

Tests exercise behavior by executing lowered closures, checking actual diagnostics and maps, invoking bundlers, rendering independent components, and installing the packed package into a clean consumer. Package verification also builds and server-renders the real `@swiftuijs/ui` example and the Vue example.
