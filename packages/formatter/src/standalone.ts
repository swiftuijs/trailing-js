import * as prettier from 'prettier/standalone';
import * as estree from 'prettier/plugins/estree';
import * as typescript from 'prettier/plugins/typescript';
import { plugin } from './plugin.js';
import type { Options } from 'prettier';

/** Browser/editor entry: plugins are loaded objects, never filesystem paths. */
export function format(source: string, options: Options = {}) {
  return prettier.format(source, {
    ...options,
    parser: 'twill',
    plugins: [...(options.plugins ?? []), estree, plugin],
  });
}

/** Display-only TS/TSX formatting without Node's automatic parser loading. */
export function formatGenerated(source: string, options: Options = {}) {
  return prettier.format(source, {
    ...options,
    parser: 'typescript',
    plugins: [...(options.plugins ?? []), typescript, estree],
  });
}

export { plugin };
export default plugin;
