import { describe, expect, it } from 'vitest';
import { format } from '../src/index.twill';
import { transform } from '@swiftuijs/twill';
import { corpus, syntaxErrors } from '../../twill/tests/fixtures/typescript.js';

describe('TypeScript 5.9 grammar corpus', () => {
  it.each(corpus)(
    'formats %s alongside dialect syntax without changing TypeScript syntax',
    async (_name, native) => {
      expect(syntaxErrors(native)).toEqual([]);
      const source = native + '\nconst doubled = [1, 2, 3].map { value in value * 2 };';
      const compiled = transform(source, { filename: 'conformance.twillx' });
      expect(compiled.closures).toBe(1);
      expect(syntaxErrors(compiled.code)).toEqual([]);
      const formatted = await format(source, { filepath: 'conformance.twillx' });
      expect(await format(formatted, { filepath: 'conformance.twillx' })).toBe(formatted);
      expect(syntaxErrors(transform(formatted, { filename: 'conformance.twillx' }).code)).toEqual(
        [],
      );
    },
  );
});
