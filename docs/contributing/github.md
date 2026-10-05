# GitHub language registration

This guide is for maintainers preparing a Linguist submission. Application users should use the [current highlighting setup](../github.md).

## Official Twill recognition

Follow Linguist's [contribution process](https://github.com/github-linguist/linguist/blob/main/CONTRIBUTING.md#adding-a-language):

1. Stabilize the extensions and publish a language specification and a maintained, appropriately licensed TextMate grammar. Our MIT-licensed grammars under `editors/vscode/syntaxes` are a starting point. Validate their TypeScript/TSX includes and regular expressions with Linguist's grammar importer; passing a VS Code tokenizer test is not sufficient.
2. Establish genuine public usage. The current [usage requirements](https://github.com/github-linguist/linguist/blob/main/CONTRIBUTING.md#language-extension-and-filename-usage-requirements) require at least **2,000 indexed files per ordinary source extension in the last year**, excluding forks, with a reasonable distribution across users and repositories. Maintainer-dominated results may be filtered. The lower 200-file threshold is for names normally occurring once per repository, such as `Makefile`; it does not describe `.twill` or `.twillx`. Recheck the policy before submitting.
3. Contribute language definitions, the grammar through `script/add-grammar`, representative licensed real-world samples, generated language IDs, tests, and search evidence using the upstream PR template. Decide how the two grammars will be represented and grouped before submission.
4. Wait for upstream review and GitHub deployment. A merged PR does not immediately update github.com. After deployment, remove the TypeScript/TSX overrides from repositories that should report Twill instead.

We are not claiming official registration. Linguist explicitly excludes very new or hobby languages without sufficient adoption. The repository override is the available path today; generating artificial usage is not a substitute for adoption.
