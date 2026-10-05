import * as prettier from 'prettier';
import * as estree from 'prettier/plugins/estree';
import * as typescript from 'prettier/plugins/typescript';
import { plugin } from './plugin.js';

export { plugin };
export default plugin;

export function format(source: string, options: prettier.Options = {}) {
  return prettier.format(source, {
    ...options,
    parser: 'twill',
    plugins: [...(options.plugins ?? []), plugin],
  });
}

/** Display-only formatting. Retain compiler results for mapped tooling. */
export function formatGenerated(source: string, options: prettier.Options = {}) {
  return prettier.format(source, {
    ...options,
    parser: 'typescript',
    plugins: [...(options.plugins ?? []), typescript, estree],
  });
}
