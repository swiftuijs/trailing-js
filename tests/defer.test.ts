import { describe, expect, it } from 'vitest';
import { transform, originalPosition, TwillSyntaxError } from '../packages/twill/src/compiler';
import { parse } from '../packages/twill/src/parser.js';

function compile(source: string, sourceType: 'script' | 'module' = 'module') {
  const result = transform(source, { filename: 'cleanup.twill', language: 'js', sourceType });
  parse(result.code, 'js', sourceType);
  return Function(result.code + '; return run;')();
}

describe('contextual defer', () => {
  it('runs reached cleanups once in reverse order on return and fallthrough', () => {
    const run = compile(
      'function run(events, early) { defer { events.push("first"); } if(early) { return 7; } defer { events.push("second"); } events.push("body"); }',
    );
    const events: string[] = [];
    expect(run(events, false)).toBeUndefined();
    expect(events).toEqual(['body', 'second', 'first']);
    events.length = 0;
    expect(run(events, true)).toBe(7);
    expect(events).toEqual(['first']);
  });
  it('uses block lifetimes, tracks conditional registrations and repeats unbraced loop registrations', () => {
    const run = compile(
      'function run(events) { defer { events.push("outer"); } { defer { events.push("inner"); } events.push("body"); } if(false) defer { events.push("unreached"); } for(let i=0;i<3;i++) defer { events.push(i); } events.push("tail"); }',
    );
    const events: unknown[] = [];
    run(events);
    expect(events).toEqual(['body', 'inner', 'tail', 2, 1, 0, 'outer']);
    const loop = compile(
      'function run(events) { for(let i=0;i<3;i++) { defer { events.push(i); } if(i===0) continue; if(i===1) break; } events.push("done"); }',
    );
    events.length = 0;
    loop(events);
    expect(events).toEqual([0, 1, 'done']);
  });
  it('captures live lexical bindings, including later declarations', () => {
    const events: unknown[] = [];
    compile(
      'function run(events) { let value=1; defer { events.push(value, later); } const later=3; value=2; return value; }',
    )(events);
    expect(events).toEqual([2, 3]);
  });
  it('runs every cleanup on throw and applies nested-finally failure ordering', () => {
    const events: string[] = [];
    const run = compile(
      'function run(events) { defer { events.push("oldest"); throw "oldest failure"; } defer { events.push("newest"); throw "newest failure"; } throw "body failure"; }',
    );
    expect(() => run(events)).toThrow('oldest failure');
    expect(events).toEqual(['newest', 'oldest']);
    const plain = compile(
      'function run(events, error) { defer { events.push("cleanup"); } throw error; }',
    );
    const failure = new Error('body');
    try {
      plain(events, failure);
      throw new Error('unreachable');
    } catch (error) {
      expect(error).toBe(failure);
    }
    let thrown = false;
    try {
      compile('function run(){ defer { throw undefined; } return 1; }')();
    } catch (error) {
      thrown = true;
      expect(error).toBeUndefined();
    }
    expect(thrown).toBe(true);
  });
  it('retains strict directives and function hoisting, captures and var/parameter bindings', () => {
    const events: unknown[] = [];
    const run = compile(
      'function run(events, helper) { "use strict"; events.push(helper(), this); defer { events.push(helper.name); } var helper; let value=9; function helper() { return value; } return helper(); }',
    );
    // Calling the hoisted function before value initialization preserves its TDZ.
    expect(() => run(events, 4)).toThrow(ReferenceError);
    expect(events).toEqual([]);
    const late = compile(
      'function run(events, helper) { "use strict"; defer { events.push(helper.name, this); } let value=9; function helper() { return value; } var helper; return helper(); }',
    );
    expect(late(events, 4)).toBe(9);
    expect(events).toEqual(['helper', undefined]);
    const mapped = compile(
      'function run(helper) { defer {} function helper(){} return arguments[0] === helper; }',
      'script',
    );
    expect(mapped(3)).toBe(true);
    const duplicate = compile(
      'function run() {function helper(){return 1;} defer {} const result=helper(); function helper(){return 2;} return result;}',
      'script',
    );
    expect(duplicate()).toBe(2);
  });
  it('keeps lexical this, arguments, super and new.target', () => {
    const events: unknown[] = [];
    const run = compile(
      'function run(events) { class Base { value(){return 4;} } class Child extends Base { value() { defer { events.push(this, super.value(), arguments.length); } return 8; } } const value=new Child(); value.value(1); function C() { defer { events.push(new.target); } } new C(); return [value,C]; }',
    );
    const [value, C] = run(events);
    expect(events).toEqual([value, 4, 1, C]);
  });
  it('awaits async cleanup serially and continues older cleanups after rejection', async () => {
    const events: unknown[] = [];
    const run = compile(
      'async function run(events) { defer { events.push("oldest"); } defer { await Promise.resolve(); events.push("async"); throw "cleanup failure"; } defer { events.push("newest"); } return 3; }',
    );
    await expect(run(events)).rejects.toBe('cleanup failure');
    expect(events).toEqual(['newest', 'async', 'oldest']);
    events.length = 0;
    const nested = compile(
      'async function run(events) { defer { defer { await Promise.resolve(); events.push("nested"); } events.push("outer"); } return 3; }',
    );
    await expect(nested(events)).resolves.toBe(3);
    expect(events).toEqual(['outer', 'nested']);
  });
  it('does not add an await turn for synchronous cleanup in async functions', async () => {
    const events: string[] = [];
    const run = compile(
      'async function run(events) { defer { events.push("cleanup"); } events.push("body"); return 2; }',
    );
    const promise = run(events);
    expect(events).toEqual(['body', 'cleanup']);
    expect(await promise).toBe(2);
  });
  it('runs on generator close and does not register unreachable cleanups', () => {
    const events: string[] = [];
    const run = compile(
      'function* run(events) { defer { events.push("cleanup"); } yield 1; defer { events.push("unreached"); } }',
    );
    const iterator = run(events);
    expect(iterator.next().value).toBe(1);
    expect(events).toEqual([]);
    iterator.return();
    expect(events).toEqual(['cleanup']);
  });
  it('preserves normal defer identifiers and allows explicit callback calls', () => {
    const source =
      'const defer = x => x; defer(1); defer / 2; const object={defer:1}; object.defer; defer: { break defer; } defer\n{ const local=2; }';
    expect(transform(source, { filename: 'identifiers.twill' }).code).toBe(source);
    const run = compile('function run(){ const defer = cb => cb(); return defer() { 42 }; }');
    expect(run()).toBe(42);
  });
  it('rejects cross-boundary jumps, own returns, module-level registration and unbraced switch cases', () => {
    for (const source of [
      'function run(){ defer { return 1; } }',
      'function run(){ outer: while(true) { defer { break outer; } break; } }',
      'function run(){ while(true) { defer { continue; } break; } }',
      'function run(){ defer { await Promise.resolve(); } }',
      'function* run(){ defer { yield 1; } }',
      'defer {}',
      'function run(){switch(1){case 1: defer {} break;}}',
    ])
      expect(() => transform(source, { filename: 'error.twill' })).toThrow(TwillSyntaxError);
    expect(() =>
      transform('function run(){ switch(1){case 1:{ defer {} break; }} }', {
        filename: 'ok.twill',
      }),
    ).not.toThrow();
  });
  it('retains cleanup token mappings and hygienic locals', () => {
    const source =
      'function run(events) { const __twillDefers0 = 7; defer { events.push(__twillDefers0); } return 1; }';
    const result = transform(source, { filename: 'maps.twill' });
    const before = result.code.slice(0, result.code.indexOf('events.push')).split('\n');
    expect(originalPosition(result, before.length, before.at(-1)!.length)).toMatchObject({
      column: source.indexOf('events.push'),
    });
    const events: number[] = [];
    compile(source)(events);
    expect(events).toEqual([7]);
    expect(result).toMatchObject({ changed: true, defers: 1 });
  });
  it('supports async generators, async superclass expressions and cleanup-local functions', async () => {
    const events: unknown[] = [];
    const generator = compile(
      'async function* run(events) { defer { await Promise.resolve(); events.push("closed"); } yield 1; }',
    );
    const iterator = generator(events);
    expect((await iterator.next()).value).toBe(1);
    await iterator.return();
    expect(events).toEqual(['closed']);
    const run = compile(
      'async function run(events) { class Base { value(){return 3;} } defer { class C extends (await Promise.resolve(Base)) {} function value(){return new C().value();} events.push(value()); } return 1; }',
    );
    expect(await run(events)).toBe(1);
    expect(events).toEqual(['closed', 3]);
  });
  it('composes with guards, trailing closures, nested finally', () => {
    const events: string[] = [];
    const run = compile(
      'function run(events) { defer { events.push("outer"); } const fn = cb => cb(); try { return fn() { defer { events.push("callback"); } guard true else { return 0; } return 3; }; } finally { events.push("finally"); } }',
    );
    expect(run(events)).toBe(3);
    expect(events).toEqual(['callback', 'finally', 'outer']);
  });
  it('supports static cleanup and trailing callbacks inside computed superclass lookups', () => {
    const run = compile(
      'function run(events) { class Base {} const bases=[Base]; const choose=cb=>cb(); class C extends bases[choose() { 0 }] { static { defer { events.push(this.name); } events.push("static"); } } return new C() instanceof Base; }',
    );
    const events: string[] = [];
    expect(run(events)).toBe(true);
    expect(events).toEqual(['static', 'C']);
  });
  it('keeps escaped identifiers ordinary and diagnoses unsupported function-body overloads', () => {
    const source = String.raw`function run(e){ const d\u0065fer=1; d\u0065fer { e.push(2); }; return d\u0065fer; }`;
    // An escaped identifier is a callback call in this dialect, not a cleanup.
    const result = transform(source, { filename: 'escaped.twill' });
    expect(result.defers).toBe(0);
    expect(result.closures).toBe(1);
    expect(() =>
      transform(
        'function run(){ defer {} function f(x: string): string; function f(x: any){ return x; } }',
      ),
    ).toThrow('Function overloads/ambient function declarations');
    const events: number[] = [];
    compile('function run(e){ defer /* same line */ { e.push(1); } }')(events);
    expect(events).toEqual([1]);
  });
});
