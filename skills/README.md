# Official Twill skill

[twill/SKILL.md](twill/SKILL.md) is the canonical, self-contained Agent Skill for writing, reviewing, debugging and migrating applications. It targets the published language baseline in its metadata and distinguishes source prototypes. Repository maintainers follow [AGENTS.md](../AGENTS.md).

Install from an application directory:

```sh
npx skills add swiftuijs/twill --skill twill
```

For a source checkout before publication, use `npx skills add /absolute/path/to/twill --skill twill`. Agent selection, project/global scope, manual download and usage examples are in the [AI assistance guide](https://twill.evecalm.com/ai).

Run `pnpm verify:skills` after building compiler/formatter dependencies. It checks metadata, baseline and documentation links, then typechecks, executes and formats the actual code fences. `--compiler /path/to/installed/@swiftuijs/twill` can additionally exercise those examples against an independently installed published compiler. Validation uses repository-owned React test dependencies for the UI example; no compiler or framework is shipped inside the skill.

The docs build/dev generates `/skills/twill/SKILL.md` and `/.well-known/agent-skills/index.json` from that file. The discovery artifact digest and relative URL work under both root and subpath hosting. Generated assets are ignored; editing them cannot update the official source. Language/tooling/release changes must review the instructions and examples in the same PR. See [RFC 0033](../docs/rfcs/0033-official-ai-skill.md).
