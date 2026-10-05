# Twill linter

An ESLint 9/10 flat-config plugin for `.twill` and `.twillx`, with typescript-eslint rules, original-source diagnostics and conservative fixes.

Packages are currently distributed as reviewed tarballs. Follow [getting started](../../docs/getting-started.md) to obtain them, then install in your application:

```sh
pnpm add -D /path/to/swiftuijs-twill-linter-0.9.0.tgz eslint
```

`eslint.config.mjs`:

```js
import twill from '@swiftuijs/twill-linter';
export default [
  { ignores: ['**/dist/**'] },
  ...twill.configs.recommended,
  { languageOptions: { globals: { console: 'readonly' } } },
];
```

```sh
pnpm eslint src
pnpm eslint src --fix
```

`recommended` supplies standard JS and typescript-eslint recommended rules. `recommendedTypeChecked` additionally supplies typed rules; Twill files need a nearby tsconfig and are checked against Twill's virtual TypeScript program. Native TS files use typescript-eslint's project service normally. Add ordinary framework/environment globals as with any ESLint project.

`recommendedTypeChecked` also enables `@typescript-eslint/switch-exhaustiveness-check`. A switch over a discriminated union must explicitly cover each variant, even when it has a `default` branch. Adding a variant then exposes missing handlers in both Twill and native TS files. This check is opt-in linting, not a new compiler guarantee; run ESLint in CI to enforce it. Ordinary `recommended` does not require type information. See [practical patterns](../../docs/patterns.md) for an example.

The processor honors the project Twill/JSX settings. Generated-only diagnostics are suppressed. Fixes and suggestions are offered only when their ranges and replaced text map exactly to original source; fixes requiring compiler-generated syntax are withheld. `disposeProjects()` releases the cached typed projects when embedding the plugin in a long-lived process. The typed cache checks existing project/configuration file mtimes; restart linting after adding/deleting files to refresh discovered roots.

For VS Code, use Microsoft's ESLint extension and add `twill-typescript` and `twill-tsx` to `eslint.validate`. The Twill VSIX supplies language IDs and TypeScript diagnostics; ESLint supplies lint rules and fixes.

Custom rule overrides should also match the virtual TS/TSX files, as with other ESLint processors:

```js
{ files: ['**/*.{ts,tsx,twill,twillx}'], rules: { 'prefer-const': 'error' } }
```

Framework ESLint plugins can attach their ordinary TS/TSX rules to these virtual files. Keep ESLint formatting rules disabled and let Prettier handle layout; rewrites spanning generated syntax cannot always be mapped back safely.
