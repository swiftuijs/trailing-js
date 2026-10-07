import { expect, it } from 'vitest';
import { runDefers } from '../src/helpers/v1.js';
it('drains reached cleanups synchronously in reverse order and empties the stack', () => {
  const events: number[] = [];
  const stack = [() => events.push(1), () => events.push(2), () => events.push(3)];
  expect(runDefers(stack)).toBeUndefined();
  expect(events).toEqual([3, 2, 1]);
  expect(stack).toEqual([]);
  runDefers(stack);
  expect(events).toEqual([3, 2, 1]);
});
it('does nothing for absent, empty or sparse storage', () => {
  expect(runDefers(undefined)).toBeUndefined();
  expect(runDefers([])).toBeUndefined();
  expect(runDefers(new Array<() => unknown>(3))).toBeUndefined();
});
it.each([undefined, null, 0, false, 'failure', Error('failure')])(
  'throws the last cleanup failure including %s',
  (failure) => {
    const events: number[] = [];
    let caught = false,
      actual;
    const stack = [
      () => {
        events.push(1);
        throw failure;
      },
      () => {
        events.push(2);
        throw Error('newer');
      },
      () => events.push(3),
    ];
    try {
      runDefers(stack);
    } catch (error) {
      caught = true;
      actual = error;
    }
    expect(caught).toBe(true);
    expect(actual).toBe(failure);
    expect(events).toEqual([3, 2, 1]);
    expect(stack).toEqual([]);
  },
);
it('retains a cleanup failure even if an older cleanup succeeds', () => {
  const failure = Error('cleanup');
  const events: number[] = [];
  expect(() =>
    runDefers([
      () => events.push(1),
      () => {
        events.push(2);
        throw failure;
      },
    ]),
  ).toThrow(failure);
  expect(events).toEqual([2, 1]);
});
it('preserves a body failure on success and replaces it on cleanup failure', () => {
  const body = Error('body'),
    cleanup = Error('cleanup');
  expect(() => {
    try {
      throw body;
    } finally {
      runDefers([() => {}]);
    }
  }).toThrow(body);
  expect(() => {
    try {
      throw body;
    } finally {
      runDefers([
        () => {
          throw cleanup;
        },
      ]);
    }
  }).toThrow(cleanup);
});
it('does not access thenables or introduce async scheduling', () => {
  let accessed = false;
  const thenable = {
    get then() {
      accessed = true;
      throw Error('unexpected await');
    },
  };
  const events: number[] = [];
  runDefers([() => events.push(1), () => thenable, () => events.push(2)]);
  expect(accessed).toBe(false);
  expect(events).toEqual([2, 1]);
});
it('retains lexical captures and recursively drains independent scopes', () => {
  const events: number[] = [];
  let value = 1;
  const stack = [
    () => events.push(value),
    () => runDefers([() => events.push(3), () => events.push(4)]),
  ];
  value = 2;
  runDefers(stack);
  expect(events).toEqual([4, 3, 2]);
});
