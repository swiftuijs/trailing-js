import { resolve } from 'node:path';
import { probeTypeScriptPlugin } from '../../../packages/twill/tests/helpers/probe-typescript-plugin.mjs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../../../', import.meta.url)));
await probeTypeScriptPlugin(resolve('editors/vscode'), '@swiftuijs/twill-vscode-tsserver');
console.log(
  'Bundled editor plugin passed native TS/JS diagnostics, hover, definitions and unsaved-source checks.',
);
