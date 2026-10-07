import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export const skillFile = new URL('./twill/SKILL.md', import.meta.url);

/** Read the canonical skill's deliberately small YAML metadata profile. */
export function readSkill() {
  const content = readFileSync(skillFile, 'utf8');
  const metadata = content.match(/^---\n([\s\S]*?)\n---\n/);
  assert(metadata, 'Skill requires YAML frontmatter');
  const name = metadata[1].match(/^name: ([a-z0-9-]+)$/m)?.[1];
  const description = metadata[1]
    .match(/^description: >-\n((?:  .*(?:\n|$))+)/m)?.[1]
    .trim()
    .replace(/\n\s*/g, ' ');
  const release = metadata[1].match(/^  release: (\d+\.\d+\.\d+)$/m)?.[1];
  assert.equal(name, 'twill', 'Skill name must match its install directory');
  assert(description && description.length <= 1024, 'Skill needs a useful description');
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version;
  assert.equal(release, version, 'Review the skill baseline when changing release versions');
  for (const link of content.matchAll(/\]\(https:\/\/twill\.evecalm\.com\/([a-z-]+)(?:#[^)]*)?\)/g))
    readFileSync(new URL(`../docs/${link[1]}.md`, import.meta.url));
  return { name, description, release, content };
}
