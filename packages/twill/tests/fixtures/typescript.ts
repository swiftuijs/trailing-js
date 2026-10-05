import ts from 'typescript';

// Independent TypeScript syntax checks: these do not claim every feature is
// type-correct, or that all combinations in TypeScript's grammar are supported.
export const corpus = [
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

export function syntaxErrors(source: string) {
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
