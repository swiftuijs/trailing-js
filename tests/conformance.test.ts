import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { format } from '@swiftuijs/twill-formatter';
import { transform } from '../packages/twill/src/compiler';

// Independent TypeScript syntax checks: these do not claim every feature is
// type-correct, or that all combinations in TypeScript's grammar are supported.
const corpus = [
  [
    'mapped/key-remapped types',
    'type Fields<T> = { [K in keyof T as `get${Capitalize<K & string>}`]?: T[K] };',
  ],
  [
    'conditional/infer types',
    'type Result<T> = T extends (...args: any[]) => infer R ? R : never;',
  ],
  ['named tuples', 'type Args = [name: string, count?: number, ...rest: boolean[]];'],
  [
    'type predicates',
    'function isString(value: unknown): value is string { return typeof value === "string"; }',
  ],
  [
    'assertion signatures',
    'function assert(value: unknown): asserts value { if (!value) throw new Error(); }',
  ],
  ['const/satisfies', 'const settings = { name: "twill" } as const satisfies { name: string };'],
  ['const type parameters', 'function identity<const T>(value: T): T { return value; }'],
  [
    'instantiation expressions',
    'function identity<T>(value: T): T { return value; } const strings = identity<string>;',
  ],
  [
    'private members/parameter properties',
    'class Box { #value = 1; constructor(public name: string) {} get value() { return this.#value; } }',
  ],
  [
    'abstract members',
    'abstract class Base { abstract get value(): number; abstract run(): void; }',
  ],
  ['override', 'class Base { run() {} } class Child extends Base { override run() {} }'],
  ['decorators', 'declare const logged: any; class Box { @logged run() {} }'],
  ['auto-accessors', 'class Box { accessor value = 1; }'],
  [
    'namespaces',
    'namespace Model { export interface Value { count: number } export const initial = 1; }',
  ],
  ['const enums', 'const enum Status { Ready, Done } const status = Status.Ready;'],
  ['import attributes', 'import settings from "./settings.json" with { type: "json" };'],
  [
    'dynamic import attributes',
    'const settings = import("./settings.json", { with: { type: "json" } });',
  ],
  ['explicit resource management', 'declare const resource: any; using handle = resource;'],
  ['async resource management', 'declare const resource: any; await using handle = resource;'],
  ['ambient modules', 'declare module "service" { export function read(): string; }'],
  [
    'overloads',
    'function read(value: string): string; function read(value: number): number; function read(value: unknown) { return value; }',
  ],
  [
    'JSX fragments',
    'declare const View: any; const view = <><View value={1} /><span>hello</span></>;',
  ],
] as const;

function syntaxErrors(source: string) {
  return (
    ts
      .transpileModule(source, {
        fileName: 'conformance.tsx',
        compilerOptions: {
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.Preserve,
        },
        reportDiagnostics: true,
      })
      .diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) ??
    []
  );
}

describe('TypeScript 5.9 grammar corpus', () => {
  it.each(corpus)('preserves %s alongside dialect syntax and formatting', async (_name, native) => {
    expect(syntaxErrors(native)).toEqual([]);
    const source = native + '\nconst doubled = [1, 2, 3].map { value in value * 2 };';
    const compiled = transform(source, { filename: 'conformance.twillx' });
    expect(compiled.closures).toBe(1);
    expect(syntaxErrors(compiled.code)).toEqual([]);
    const formatted = await format(source, { filepath: 'conformance.twillx' });
    expect(await format(formatted, { filepath: 'conformance.twillx' })).toBe(formatted);
    expect(syntaxErrors(transform(formatted, { filename: 'conformance.twillx' }).code)).toEqual([]);
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
