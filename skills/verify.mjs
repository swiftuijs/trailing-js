import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readSkill } from './skill.mjs';
import { format as formatSource } from '../packages/formatter/dist/index.js';

const skill = readSkill();
const selected = process.argv.indexOf('--compiler');
const directory =
  selected < 0
    ? fileURLToPath(new URL('../packages/twill/', import.meta.url))
    : resolve(process.argv[selected + 1]);
const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
assert.equal(manifest.version, skill.release, 'Example compiler must match the skill baseline');
const { transform } = await import(pathToFileURL(join(directory, 'dist/index.js')).href);
const { TwillProject } = await import(pathToFileURL(join(directory, 'dist/project.js')).href);
const require = createRequire(pathToFileURL(join(directory, 'package.json')));
const ts = require('typescript');
const applicationRequire = createRequire(
  new URL('../packages/twill/package.json', import.meta.url),
);
const root = mkdtempSync(join(tmpdir(), 'twill-skill-'));
let project;
try {
  symlinkSync(
    fileURLToPath(new URL('../packages/twill/node_modules/', import.meta.url)),
    join(root, 'node_modules'),
    'junction',
  );
  writeFileSync(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        skipLibCheck: true,
        types: [],
      },
      include: ['*.twill', '*.twillx'],
    }),
  );
  const examples = [...skill.content.matchAll(/^```(twillx?)\n([\s\S]*?)^```/gm)];
  assert(examples.length > 0, 'Skill needs complete, verified language examples');
  for (const [index, [, language, source]] of examples.entries()) {
    const filename = join(root, `example-${index}.${language}`);
    writeFileSync(filename, source);
    const formatted = await formatSource(source, { filepath: filename });
    assert.equal(await formatSource(formatted, { filepath: filename }), formatted);
    writeFileSync(join(root, `formatted-${index}.${language}`), formatted);
    for (const text of [source, formatted]) {
      const module = {};
      const generated = transform(text, { filename }).code;
      const emitted = ts.transpileModule(generated, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText;
      Function('exports', 'require', emitted)(module, applicationRequire);
      if (module.activeNames) {
        assert.deepEqual(module.activeNames, ['ADA']);
        assert.deepEqual(module.doubled, [2, 4]);
      }
      if (module.label) {
        assert.equal(module.label(null), 'Missing');
        assert.equal(module.label({}), 'Anonymous');
        assert.equal(module.label({ name: '' }), '');
      }
      if (module.readOwned) {
        assert.equal(await module.readOwned(async () => null), 'Missing');
        const events = [];
        assert.equal(
          await module.readOwned(async () => ({
            async read() {
              events.push('read');
              await Promise.resolve();
              events.push('resolved');
              return 'Text';
            },
            async close() {
              events.push('close');
            },
          })),
          'Text',
        );
        assert.deepEqual(events, ['read', 'resolved', 'close']);
        const failure = new Error('read failed');
        events.length = 0;
        await assert.rejects(
          module.readOwned(async () => ({
            async read() {
              throw failure;
            },
            async close() {
              events.push('close');
            },
          })),
          (error) => error === failure,
        );
        assert.deepEqual(events, ['close']);
      }
      if (module.describe) {
        assert.equal(module.describe({ kind: 'ok', value: 0 }), '0.00');
        assert.equal(module.describe({ kind: 'error', message: 'Offline' }), 'Offline');
        assert.throws(() => module.describe({ kind: 'unexpected' }), /Non-exhaustive/);
      }
      if (language === 'twillx') {
        const { createElement } = applicationRequire('react');
        const { renderToStaticMarkup } = applicationRequire('react-dom/server');
        assert.equal(
          renderToStaticMarkup(createElement(module.default)),
          '<section><button>Count: 0</button></section>',
        );
      }
    }
  }
  project = new TwillProject(join(root, 'tsconfig.json'));
  assert.deepEqual(
    project.diagnostics(),
    [],
    'Every original/formatted skill example must typecheck',
  );
  console.log(
    `Official Twill skill: ${examples.length} examples check, execute and format on ${manifest.version}.`,
  );
} finally {
  project?.dispose();
  rmSync(root, { recursive: true, force: true });
}
