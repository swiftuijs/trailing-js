# GitHub language detection and highlighting

GitHub uses [Linguist](https://github.com/github-linguist/linguist) to classify source files and select highlighting grammars. Installing the Twill VSIX changes your editor; it does not install a grammar on GitHub.

## Highlighting now

Add these lines to the root `.gitattributes` in each repository containing Twill source, then commit and push the file:

```gitattributes
*.twill linguist-language=TypeScript
*.twillx linguist-language=TSX
```

This repository already includes them. The patterns also apply to files in subdirectories, subject to more specific attribute overrides. GitHub's [documented language overrides](https://github.com/github-linguist/linguist/blob/main/docs/overrides.md) select the existing TypeScript and TSX grammars. Their names are registered in [Linguist's language definitions](https://github.com/github-linguist/linguist/blob/main/lib/linguist/languages.yml).

This provides base-language highlighting without changing our extensions. Twill-specific constructs such as `defer`, `guard` and trailing-closure parameter headers use whatever the TypeScript grammar recognizes; this is not the dedicated Twill grammar. Language statistics classify these files as TypeScript (TSX belongs to that language group), rather than a new Twill language. Normal vendored, documentation and generated-file exclusions still apply.

Markdown fences do not inherit `.gitattributes`. Use `typescript` or `tsx` fences for now. A `twill` fence or `linguist-language=Twill` cannot install an unregistered language or grammar.

Check local Git attributes with:

```sh
git check-attr linguist-language -- examples/basic/main.twill examples/react/App.twillx
```

This verifies attribute selection, not GitHub's rendered page. GitHub controls deployment and refresh timing.

## Official Twill recognition

Follow Linguist's [contribution process](https://github.com/github-linguist/linguist/blob/main/CONTRIBUTING.md#adding-a-language):

1. Stabilize the extensions and publish a language specification and a maintained, appropriately licensed TextMate grammar. Our MIT-licensed grammars under `editors/vscode/syntaxes` are a starting point. Validate their TypeScript/TSX includes and regular expressions with Linguist's grammar importer; passing a VS Code tokenizer test is not sufficient.
2. Establish genuine public usage. The current [usage requirements](https://github.com/github-linguist/linguist/blob/main/CONTRIBUTING.md#language-extension-and-filename-usage-requirements) require at least **2,000 indexed files per ordinary source extension in the last year**, excluding forks, with a reasonable distribution across users and repositories. Maintainer-dominated results may be filtered. The lower 200-file threshold is for names normally occurring once per repository, such as `Makefile`; it does not describe `.twill` or `.twillx`. Recheck the policy before submitting.
3. Contribute language definitions, the grammar through `script/add-grammar`, representative licensed real-world samples, generated language IDs, tests, and search evidence using the upstream PR template. Decide how the two grammars will be represented and grouped before submission.
4. Wait for upstream review and GitHub deployment. A merged PR does not immediately update github.com. After deployment, remove the TypeScript/TSX overrides from repositories that should report Twill instead.

We are not claiming official registration. Linguist explicitly excludes very new or hobby languages without sufficient adoption. The repository override is the available path today; generating artificial usage is not a substitute for adoption.
