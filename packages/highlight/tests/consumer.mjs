import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const version = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
const archive = resolve(import.meta.dirname, `../../../swiftuijs-twill-highlight-${version}.tgz`);
const directory = mkdtempSync(resolve(tmpdir(), 'twill-highlight-consumer-'));
try {
  writeFileSync(
    resolve(directory, 'package.json'),
    JSON.stringify({ private: true, type: 'module' }),
  );
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const commandOptions = { cwd: directory, stdio: 'pipe', shell: process.platform === 'win32' };
  execFileSync(
    npm,
    ['install', '--ignore-scripts', '--no-audit', '--no-fund', archive, 'typescript@5.9.3'],
    commandOptions,
  );
  writeFileSync(
    resolve(directory, 'grammar-only.mjs'),
    `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { twillLanguages } from '@swiftuijs/twill-highlight';
const require = createRequire(import.meta.url);
assert.equal(twillLanguages.length, 2);
assert.throws(() => require.resolve('shiki'), { code: 'MODULE_NOT_FOUND' });
const raw = JSON.parse(readFileSync(require.resolve('@swiftuijs/twill-highlight/grammars/twillx'), 'utf8'));
assert.equal(raw.scopeName, 'source.twill.tsx');
`,
  );
  execFileSync(process.execPath, ['grammar-only.mjs'], commandOptions);
  writeFileSync(
    resolve(directory, 'grammar-only.ts'),
    `
import { twillLanguages, type TwillGrammar } from '@swiftuijs/twill-highlight';
const languages: TwillGrammar[] = twillLanguages;
const scope: string = languages[0].scopeName;
`,
  );
  execFileSync(
    process.execPath,
    [
      'node_modules/typescript/bin/tsc',
      '--noEmit',
      '--strict',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--target',
      'ES2022',
      'grammar-only.ts',
    ],
    commandOptions,
  );
  for (const version of ['2.5.0', '3.23.0', '4.5.0']) {
    execFileSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        archive,
        `shiki@${version}`,
        'typescript@5.9.3',
      ],
      { cwd: directory, stdio: 'pipe', shell: process.platform === 'win32' },
    );
    writeFileSync(
      resolve(directory, 'test.mjs'),
      `
import assert from 'node:assert/strict';
import { twillLanguages } from '@swiftuijs/twill-highlight';
import { createTwillHighlighter } from '@swiftuijs/twill-highlight/shiki';
import { createHighlighter } from 'shiki';
assert.equal(twillLanguages.length, 2);
const standalone = await createTwillHighlighter();
const custom = await createHighlighter({ themes: ['nord'], langs: ['typescript', 'tsx', ...twillLanguages] });
for (const engine of [standalone, custom]) {
  const theme = engine === standalone ? 'github-dark' : 'nord';
  const html = engine.codeToHtml('const users = values.filter { .active };', { lang: 'twill', theme });
  assert(html.includes('shiki') && html.includes('color:'));
  const parts = engine.codeToTokensBase('return Panel { <button onClick={() => ready && (value ?? 1)}>Count</button>; };', { lang: 'twillx', theme, includeExplanation: true }).flat().flatMap(token => token.explanation ?? []);
  for (const [text, scope] of [['button', 'entity.name.tag.'], ['onClick', 'entity.other.attribute-name.'], ['&&', 'keyword.operator.logical.'], ['??', 'keyword.operator.logical.']])
    assert(parts.some(part => part.content === text && part.scopes.some(item => item.scopeName.startsWith(scope))), text);
  const literal = engine.codeToTokensBase('const view = <Panel>guard true else; .active</Panel>;', { lang: 'twillx', theme, includeExplanation: true }).flat().flatMap(token => token.explanation ?? []);
  assert(!literal.some(part => part.scopes.some(item => item.scopeName === 'keyword.control.twill' || item.scopeName === 'variable.other.property.twill')));
  for (const lang of ['twill', 'twillx']) {
    const enumeration=engine.codeToTokensBase('enum State<T> {\\ncase idle;\\ncase loaded(value:T, count:number);\\ncase 加载(value:T);\\n}',{lang,theme,includeExplanation:true}).flat().flatMap(token=>token.explanation??[]);
    for(const [text,scope] of [['case','keyword.control.twill'],['loaded','entity.name.function.twill'],['加载','entity.name.function.twill'],['number','support.type.primitive.']]) assert(enumeration.some(part=>part.content===text&&part.scopes.some(item=>item.scopeName.startsWith(scope))),text);
    const implicit = engine.codeToTokensBase('const names = users.filter { .active && .verified }.map { .profile?.name ?? "Anonymous" };', { lang, theme, includeExplanation: true }).flat().flatMap(token => token.explanation ?? []);
    for (const text of ['&&', '??']) assert(implicit.some(part => part.content === text && part.scopes.some(item => item.scopeName.startsWith('keyword.operator.logical.'))), text);
  }
  engine.dispose();
}
`,
    );
    execFileSync(process.execPath, ['test.mjs'], { cwd: directory, stdio: 'pipe' });
    writeFileSync(
      resolve(directory, 'types.ts'),
      `
import { twillLanguages } from '@swiftuijs/twill-highlight';
import { createTwillHighlighter } from '@swiftuijs/twill-highlight/shiki';
import { createHighlighter } from 'shiki';
const custom = await createHighlighter({ themes: ['nord'], langs: ['typescript', 'tsx', ...twillLanguages] });
const standalone = await createTwillHighlighter();
const html: string = standalone.codeToHtml('values.map { .name }', { lang: 'twill', theme: 'github-dark' });
custom.dispose(); standalone.dispose();
`,
    );
    execFileSync(
      process.execPath,
      [
        'node_modules/typescript/bin/tsc',
        '--noEmit',
        '--skipLibCheck',
        '--strict',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--target',
        'ES2022',
        'types.ts',
      ],
      commandOptions,
    );
  }
  console.log(
    'Independent highlight package: grammar exports, custom Shiki theme and standalone HTML rendering passed.',
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
