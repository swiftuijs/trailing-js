import MagicString from 'magic-string';
import remapping from '@ampproject/remapping';
import {
  transform,
  TwillSyntaxError,
  originalPosition,
  type TransformOptions,
  type TransformResult,
} from './compiler.js';

/** Editor-only recovery; build and CLI compilation always use strict parsing. */
export function recoverTransform(
  source: string,
  options: TransformOptions,
  onSyntaxError?: (error: TwillSyntaxError) => void,
): TransformResult {
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
      // Descriptor offsets belong to repaired parser input. Restore their
      // source positions before the editor composes generated mappings;
      // otherwise an earlier inserted token can bypass linked-tag rename checks.
      const repairedResult = { ...result, map: repairMap };
      const starts = [0];
      for (const match of source.matchAll(/\n/g)) starts.push(match.index! + 1);
      const sourceOffset = (offset: number) => {
        const prefix = text.slice(0, offset).split('\n');
        const point = originalPosition(repairedResult, prefix.length, prefix.at(-1)!.length);
        return starts[point.line! - 1]! + point.column!;
      };
      const enumPatterns = result.enumPatterns.map((pattern) => ({
        ...pattern,
        reference: {
          ...pattern.reference,
          property: {
            ...pattern.reference.property,
            start: sourceOffset(pattern.reference.property.start),
            end: sourceOffset(pattern.reference.property.end),
          },
        },
      }));
      const map = remapping(
        [JSON.parse(result.map.toString()), JSON.parse(repairMap.toString())],
        () => null,
      );
      return { ...result, enumPatterns, map: map as unknown as TransformResult['map'] };
    } catch (error) {
      if (!(error instanceof TwillSyntaxError)) throw error;
      if (attempt === 0) onSyntaxError?.(error);
      const before = text.slice(0, error.offset);
      let insertion: string;
      let offset = error.offset;
      if (/\.\s*$/.test(before)) insertion = '__twillIncomplete';
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
      // Later parser errors refer to the repaired text. Map interior offsets
      // back before inserting again; suffix repairs always anchor at source EOF.
      if (offset >= text.length) offset = source.length;
      else if (text !== source) {
        const prefix = text.slice(0, offset).split('\n');
        const point = originalPosition(
          {
            code: text,
            map: repaired.generateMap({ source: options.filename, hires: true }),
          } as TransformResult,
          prefix.length,
          prefix.at(-1)!.length,
        );
        const starts = [0];
        for (const match of source.matchAll(/\n/g)) starts.push(match.index! + 1);
        offset =
          point.line == null || point.column == null
            ? source.length
            : starts[point.line - 1]! + point.column;
      }
      repaired.appendLeft(offset, insertion);
      text = repaired.toString();
    }
  }
  return transform(source, options);
}
