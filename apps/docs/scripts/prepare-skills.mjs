import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readSkill } from '../../../skills/skill.mjs';

const skill = readSkill();
const directory = new URL('../public/skills/twill/', import.meta.url);
const discovery = new URL('../public/.well-known/agent-skills/', import.meta.url);
mkdirSync(directory, { recursive: true });
mkdirSync(discovery, { recursive: true });
writeFileSync(new URL('SKILL.md', directory), skill.content);
writeFileSync(
  new URL('index.json', discovery),
  JSON.stringify(
    {
      $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
      skills: [
        {
          name: skill.name,
          description: skill.description,
          type: 'skill-md',
          url: '../../skills/twill/SKILL.md',
          digest: 'sha256:' + createHash('sha256').update(skill.content).digest('hex'),
        },
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log(`Prepared official ${skill.name} skill for the documentation site.`);
