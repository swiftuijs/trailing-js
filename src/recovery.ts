import MagicString from 'magic-string';
import remapping from '@ampproject/remapping';
import {
  transform,
  TrailingSyntaxError,
  type TransformOptions,
  type TransformResult,
} from './compiler';

/** Editor-only recovery; build and CLI compilation always use strict parsing. */
export function recoverTransform(source: string, options: TransformOptions): TransformResult {
  const repaired = new MagicString(source);
  let text = source;
  // Complete a missing member name or a few unfinished delimiters. Limit repair
  // attempts so malformed documents cannot lock up the extension host.
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const result = transform(text, options);
      if (text === source) return result;
      const repairMap = repaired.generateMap({
        source: options.filename,
        includeContent: true,
        hires: true,
      });
      const map = remapping(
        [JSON.parse(result.map.toString()), JSON.parse(repairMap.toString())],
        () => null,
      );
      return { ...result, map: map as unknown as TransformResult['map'] };
    } catch (error) {
      if (!(error instanceof TrailingSyntaxError)) throw error;
      const before = text.slice(0, error.offset);
      let insertion: string;
      let offset = error.offset;
      if (/\.\s*$/.test(before)) insertion = '__trailingIncomplete';
      else if (offset >= text.length) {
        // Match lexical delimiters via the original source. This path only
        // handles suffix completion; it never makes build output valid.
        const stack: string[] = [];
        const scanner =
          /(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*|[()[\]{}])/g;
        for (const token of text.matchAll(scanner)) {
          if ('([{'.includes(token[0])) stack.push(token[0]);
          else if (')]}'.includes(token[0])) stack.pop();
        }
        const opening = stack.at(-1);
        if (!opening) throw error;
        insertion = ({ '(': ')', '[': ']', '{': '}' } as Record<string, string>)[opening]!;
      } else throw error;
      // Insertions from previous repairs shift offsets; source mappings for a
      // suffix repair can all anchor at EOF, while member names anchor at the
      // original dot. Subsequent suffix repairs remain at the same source EOF.
      offset = Math.min(offset, source.length);
      repaired.appendLeft(offset, insertion);
      text = repaired.toString();
    }
  }
  return transform(source, options);
}
