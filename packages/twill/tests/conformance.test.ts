import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { transform } from '../src/compiler.js';
import { corpus, syntaxErrors } from './fixtures/typescript.js';

describe('TypeScript 5.9 grammar corpus', () => {
  it.each(corpus)('preserves %s alongside dialect syntax and formatting', async (_name, native) => {
    expect(syntaxErrors(native)).toEqual([]);
    const source = native + '\nconst doubled = [1, 2, 3].map { value in value * 2 };';
    const compiled = transform(source, { filename: 'conformance.twillx' });
    expect(compiled.closures).toBe(1);
    expect(syntaxErrors(compiled.code)).toEqual([]);
  });
});

it('matches handwritten JavaScript for 200 reproducible mixed closure/guard/defer programs', () => {
  let seed = 0x7477696c;
  const random = (size: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % size;
  };
  const execute = (source: string) =>
    Function(
      ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      }).outputText + '\nreturn run;',
    )();
  for (let iteration = 0; iteration < 200; iteration++) {
    const input = Array.from({ length: random(10) }, () => random(21) - 10);
    const threshold = random(11) - 5,
      offset = random(10),
      factor = random(5) + 1;
    const head = random(2) ? '(value: number, index: number)' : '(value, index)';
    const call = random(2) ? 'map()' : 'map<number>';
    const source = `function run(input: number[]) {
      const events: number[] = [];
      const invoke = (body: (factor: number) => number) => body(${factor});
      const output = input.${call} { ${head} in
        defer { events.push(index); }
        guard value >= ${threshold} else { return -1; }
        return invoke { (factor: number) in /* nested expression */ value * factor + ${offset} };
      }.filter { result in result >= 0 };
      return { output, events };
    }`;
    const reference = `function run(input) {
      const events = [];
      const invoke = (body) => body(${factor});
      const output = input.map((value, index) => {
        try { if (!(value >= ${threshold})) return -1;
          return invoke((factor) => value * factor + ${offset});
        } finally { events.push(index); }
      }).filter((result) => result >= 0);
      return { output, events };
    }`;
    expect(
      execute(transform(source, { filename: 'seeded.twill' }).code)(input),
      `seed iteration ${iteration}`,
    ).toEqual(execute(reference)(input));
  }
});
