import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));

// Stage the extension independently of workspace symlinks. VSCE must never
// walk the monorepo's hoisted development dependencies into the VSIX.
const stage = resolve('.twill/vsix-stage');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const name of [
  'dist',
  'syntaxes',
  'licenses',
  'LICENSE',
  'README.md',
  '.vscodeignore',
  'THIRD_PARTY_NOTICES.md',
  'language-configuration.json',
  'twill.schema.json',
])
  cpSync(join('editors/vscode', name), join(stage, name), { recursive: true });
const manifest = JSON.parse(readFileSync('editors/vscode/package.json', 'utf8'));
delete manifest.scripts;
delete manifest.devDependencies;
manifest.dependencies['@swiftuijs/twill-vscode-tsserver'] = JSON.parse(
  readFileSync('editors/vscode/twill-typescript-plugin/package.json', 'utf8'),
).version;
writeFileSync(join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
const plugin = join(stage, 'node_modules/@swiftuijs/twill-vscode-tsserver');
mkdirSync(plugin, { recursive: true });
cpSync('editors/vscode/twill-typescript-plugin/LICENSE', join(plugin, 'LICENSE'));
mkdirSync(join(plugin, 'dist'), { recursive: true });
cpSync('editors/vscode/twill-typescript-plugin/dist/index.cjs', join(plugin, 'dist/index.cjs'));
const pluginManifest = JSON.parse(
  readFileSync('editors/vscode/twill-typescript-plugin/package.json', 'utf8'),
);
delete pluginManifest.devDependencies;
delete pluginManifest.scripts;
writeFileSync(join(plugin, 'package.json'), JSON.stringify(pluginManifest, null, 2) + '\n');
const require = createRequire(import.meta.url);
mkdirSync(resolve('dist'), { recursive: true });
execFileSync(
  process.execPath,
  [require.resolve('@vscode/vsce/vsce'), 'package', '--out', resolve('dist/twill.vsix')],
  { cwd: stage, stdio: 'inherit' },
);
