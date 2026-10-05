import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  LiveCompiler,
  type CompilationState,
} from '../../.vitepress/theme/playground/live-compiler';
import type { CompileRequest, CompileResponse } from '../../.vitepress/theme/playground/protocol';

class TestWorker {
  onmessage: ((event: MessageEvent<CompileResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests: CompileRequest[] = [];
  terminate = vi.fn();
  postMessage(request: CompileRequest) {
    this.requests.push(request);
  }
  finish(request = this.requests.at(-1)!, error = false) {
    this.onmessage?.({
      data: error
        ? { id: request.id, error: { message: 'Invalid source', offset: 2 } }
        : {
            id: request.id,
            result: { code: request.source, duration: 1, closures: 0, guards: 0, defers: 0 },
          },
    } as MessageEvent<CompileResponse>);
  }
}
let client: LiveCompiler;
let workers: TestWorker[];
let states: CompilationState[];
const input = (source: string) => ({ source, filename: 'example.twill', jsxImportSource: 'react' });
beforeEach(() => {
  vi.useFakeTimers();
  workers = [];
  states = [];
  client = new LiveCompiler(
    () => {
      const worker = new TestWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
    (state) => states.push(state),
  );
});
afterEach(() => {
  client.dispose();
  vi.useRealTimers();
});

test('debounces typing and reuses the worker for subsequent compilations', () => {
  client.update(input('first'));
  vi.advanceTimersByTime(100);
  client.update(input('latest'));
  vi.advanceTimersByTime(179);
  expect(workers).toHaveLength(0);
  vi.advanceTimersByTime(1);
  expect(workers[0]!.requests.map((request) => request.source)).toEqual(['latest']);
  workers[0]!.finish();
  client.update(input('next'), true);
  expect(workers).toHaveLength(1);
  workers[0]!.finish();
  expect(states.at(-1)).toMatchObject({ phase: 'ready', result: { code: 'next' } });
});

test('coalesces queued edits and never publishes an obsolete result or diagnostic', () => {
  client.update(input('old'), true);
  client.update(input('intermediate'), true);
  client.update(input('latest'), true);
  workers[0]!.finish(workers[0]!.requests[0], true);
  expect(states.some((state) => state.phase === 'error' || state.phase === 'ready')).toBe(false);
  expect(workers[0]!.requests.map((request) => request.source)).toEqual(['old', 'latest']);
  workers[0]!.finish();
  expect(states.at(-1)).toMatchObject({ phase: 'ready', result: { code: 'latest' } });
});

test('typing does not extend an active compilation deadline; a queued edit gets a new worker', () => {
  client.update(input('hung'), true);
  vi.advanceTimersByTime(4900);
  client.update(input('replacement'), true);
  vi.advanceTimersByTime(100);
  expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  expect(workers).toHaveLength(2);
  expect(states.some((state) => state.phase === 'error')).toBe(false);
  // A late message from a terminated worker cannot replace the active result.
  workers[0]!.finish();
  workers[1]!.finish();
  expect(states.at(-1)).toMatchObject({ phase: 'ready', result: { code: 'replacement' } });
});

test('reports a timeout and can compile again', () => {
  client.update(input('hung'), true);
  vi.advanceTimersByTime(5000);
  expect(states.at(-1)).toMatchObject({
    phase: 'error',
    error: { message: expect.stringContaining('timed out') },
  });
  client.update(input('retry'), true);
  workers[1]!.finish();
  expect(states.at(-1)).toMatchObject({ phase: 'ready', result: { code: 'retry' } });
});

test('worker loading errors allow a fresh retry', () => {
  client.update(input('first'), true);
  const preventDefault = vi.fn();
  workers[0]!.onerror?.({ message: 'Failed to load', preventDefault } as unknown as ErrorEvent);
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  expect(states.at(-1)).toMatchObject({ phase: 'error', error: { message: 'Failed to load' } });
  client.update(input('retry'), true);
  workers[1]!.finish();
  expect(states.at(-1)).toMatchObject({ phase: 'ready', result: { code: 'retry' } });
});

test('worker construction failure is visible and retryable', () => {
  client.dispose();
  const create = vi.fn(() => {
    throw new Error('Worker unavailable');
  });
  client = new LiveCompiler(create, (state) => states.push(state));
  client.update(input('source'), true);
  expect(states.at(-1)).toMatchObject({ phase: 'error', error: { message: 'Worker unavailable' } });
  client.update(input('retry'), true);
  expect(create).toHaveBeenCalledTimes(2);
});

test('disposing cancels pending timers, active workers and late updates', () => {
  client.update(input('pending'));
  client.dispose();
  vi.advanceTimersByTime(5000);
  expect(workers).toHaveLength(0);
  client.update(input('ignored'), true);
  expect(workers).toHaveLength(0);
  client = new LiveCompiler(
    () => {
      const worker = new TestWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    },
    (state) => states.push(state),
  );
  client.update(input('active'), true);
  client.update(input('queued'), true);
  client.dispose();
  const count = states.length;
  workers[0]!.finish();
  vi.advanceTimersByTime(5000);
  expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  expect(states).toHaveLength(count);
  expect(workers).toHaveLength(1);
});

test('ignores unmatched response IDs and publishes a current syntax error once', () => {
  client.update(input('current'), true);
  workers[0]!.finish({ ...workers[0]!.requests[0]!, id: -1 });
  expect(states.at(-1)).toMatchObject({ phase: 'compiling' });
  workers[0]!.finish(undefined, true);
  expect(states.at(-1)).toMatchObject({ phase: 'error', error: { offset: 2 } });
});
test('handles empty loading errors, stale callbacks and non-Error posting failures', () => {
  client.update(input('first'), true);
  const previous = workers[0]!;
  previous.onerror?.({ message: '', preventDefault() {} } as ErrorEvent);
  expect(states.at(-1)).toMatchObject({
    phase: 'error',
    error: { message: expect.stringContaining('could not load') },
  });
  client.update(input('retry'), true);
  previous.onerror?.({
    message: 'stale',
    preventDefault() {
      throw new Error('should be ignored');
    },
  } as unknown as ErrorEvent);
  workers[1]!.finish();
  expect(states.at(-1)).toMatchObject({ phase: 'ready', result: { code: 'retry' } });
  vi.spyOn(workers[1]!, 'postMessage').mockImplementationOnce(() => {
    throw 'posting failed';
  });
  client.update(input('next'), true);
  expect(states.at(-1)).toMatchObject({ phase: 'error', error: { message: 'posting failed' } });
});
