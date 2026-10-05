import { build } from 'vite';
import { nodeViteConfig } from '../../../packages/twill/scripts/node-vite-config.mjs';
import { readVsix } from './read-vsix.mjs';
import { runTests } from '@vscode/test-electron';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../../../', import.meta.url)));

const root = resolve('editors/vscode/.twill/editor-integration');
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
// Test the distributable extension, not a different development bundle.
const files = await readVsix('dist/twill.vsix', (name) => name.startsWith('extension/'));
for (const [name, contents] of files) {
  const target = join(root, name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}
const workspace = join(root, 'workspace');
mkdirSync(workspace, { recursive: true });
const fixture = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      strict: true,
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      checkJs: true,
      types: [],
      skipLibCheck: true,
    },
    include: ['**/*'],
  }),
  'api.twill':
    'import {scale} from "./scale.ts";\nexport function twice(value: number): number { return [value].map { item in scale(item) }[0]!; }\nexport const unused = 0;\n',
  'scale.ts': 'export function scale(value: number): number { return value * 2; }\n',
  'auto.twill': 'export const answer = twice(21);\n',
  'consumer.ts': 'import { twice } from "./api.twill"; export const result: number = twice(21);\n',
  'settings.twill': 'export const values = [1].map { n in n + 1 };\n',
  'settings-consumer.ts':
    'import { values } from "./settings.twill"; export const checked: number[] = values;\n',
  'imports.twill':
    'import { unused, twice } from "./api.twill";\nexport const values = [1].map { n in twice(n) };\n',
  'fix.twill': 'export const values = [1].map { value in value.toFixd(2) };\n',
  'branching.twill':
    'type Result={kind:"ok";value:number}|{kind:"bad";error:string};\nexport function describe(input:{result:Result}|null){guard const {result: item}=input else{return "empty";}return switch(item){case {kind:"ok",value: amount}: amount.toFixed();case {kind:"bad",error}: error;};}\n',
  'view.twillx': `import type { ReactNode } from 'react';\ndeclare function Card(props: { title: string; onClick?: (event: { x: number }) => void; children?: ReactNode }): ReactNode;\nexport const view = Card({ tit }) { 'Hello' };\n`,
  'debug.twill':
    'const run = (body: () => void) => body();\nrun {\n  const value = 21;\n  debugger;\n  console.log(value * 2);\n};\n',
};
for (const [name, text] of Object.entries(fixture)) writeFileSync(join(workspace, name), text);
await build({
  ...nodeViteConfig({
    entry: resolve('editors/vscode/tests/host.ts'),
    outDir: root,
    filename: 'tests.cjs',
    external: ['vscode'],
    emptyOutDir: false,
  }),
  configFile: false,
});
await runTests({
  version: process.env.TWILL_TEST_VSCODE_VERSION ?? 'stable',
  vscodeExecutablePath: process.env.TWILL_TEST_VSCODE_PATH,
  extensionDevelopmentPath: join(root, 'extension'),
  extensionTestsPath: join(root, 'tests.cjs'),
  launchArgs: [
    workspace,
    '--disable-extensions',
    '--disable-workspace-trust',
    '--no-sandbox',
    '--disable-gpu',
    '--skip-welcome',
    '--skip-release-notes',
  ],
});
