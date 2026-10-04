import { parse } from './parser.js';
import { inferLanguage, type TransformOptions } from './compiler.js';

/** Original ESTree and dialect metadata for source-aware tooling. */
export function parseSyntax(source: string, options: TransformOptions = {}) {
  return parse(
    source,
    options.language ?? inferLanguage(options.filename ?? 'input.twill'),
    options.sourceType ?? 'module',
  );
}
