import assert from 'node:assert/strict';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodePayment, describeOutcome, summarizeLedger } from '../workflow.twill';

function fixture(text, options = {}) {
  const events = [];
  let acquired = 0;
  const acquire = async () => {
    acquired++;
    if (options.acquireError) throw options.acquireError;
    return {
      readText: async () => {
        events.push('read');
        if (options.readError) throw options.readError;
        return text;
      },
      close: async () => {
        events.push('close:start');
        await Promise.resolve();
        events.push('close:end');
        if (options.closeError) throw options.closeError;
      },
    };
  };
  return {
    acquire,
    events,
    get acquired() {
      return acquired;
    },
  };
}

assert.deepEqual(decodePayment({ reference: 'free', amountCents: 0 }), {
  reference: 'free',
  amountCents: 0,
});
for (const amountCents of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, null])
  assert.equal(decodePayment({ reference: 'bad', amountCents }), undefined);

for (const [text, expected] of [
  ['[]', { kind: 'ok', value: { references: [], totalCents: 0 } }],
  [
    '[{"reference":"free","amountCents":0},{"reference":"paid","amountCents":1250}]',
    { kind: 'ok', value: { references: ['free', 'paid'], totalCents: 1250 } },
  ],
  ['{', { kind: 'invalid', reason: 'json' }],
  ['null', { kind: 'invalid', reason: 'shape' }],
  ['[{}]', { kind: 'invalid', reason: 'row', row: 0 }],
  [
    JSON.stringify([
      { reference: 'max', amountCents: Number.MAX_SAFE_INTEGER },
      { reference: 'extra', amountCents: 1 },
    ]),
    { kind: 'invalid', reason: 'overflow', row: 1 },
  ],
]) {
  const source = fixture(text);
  assert.deepEqual(await summarizeLedger({}, source.acquire), expected);
  assert.deepEqual(source.events, ['read', 'close:start', 'close:end']);
}

const acquireError = new Error('acquire failure');
const unopened = fixture('[]', { acquireError });
await assert.rejects(summarizeLedger({}, unopened.acquire), (error) => error === acquireError);
assert.deepEqual(unopened.events, []);
const readError = new Error('read failure');
const unreadable = fixture('[]', { readError });
await assert.rejects(summarizeLedger({}, unreadable.acquire), (error) => error === readError);
assert.deepEqual(unreadable.events, ['read', 'close:start', 'close:end']);
const closeError = new Error('close failure');
const unclosable = fixture('[]', { closeError });
await assert.rejects(summarizeLedger({}, unclosable.acquire), (error) => error === closeError);

const controller = new AbortController();
const canceled = new Error('canceled');
controller.abort(canceled);
const skipped = fixture('[]');
await assert.rejects(
  summarizeLedger({ signal: controller.signal }, skipped.acquire),
  (error) => error === canceled,
);
assert.equal(skipped.acquired, 0);

// Cancellation during acquisition still releases the acquired resource.
const lateController = new AbortController();
const late = fixture('[]');
await assert.rejects(
  summarizeLedger({ signal: lateController.signal }, async () => {
    const source = await late.acquire();
    lateController.abort(canceled);
    return source;
  }),
  (error) => error === canceled,
);
assert.deepEqual(late.events, ['close:start', 'close:end']);

// Cancellation during pending IO is observed after IO completes, then released.
const readingController = new AbortController();
let finishRead;
let released = false;
const pending = summarizeLedger({ signal: readingController.signal }, async () => ({
  readText: () =>
    new Promise((resolve) => {
      finishRead = resolve;
    }),
  close: async () => {
    await Promise.resolve();
    released = true;
  },
}));
await Promise.resolve();
readingController.abort(canceled);
finishRead('[]');
await assert.rejects(pending, (error) => error === canceled);
assert.equal(released, true);

// Exercise an actual Node file handle through the same ordinary TS interface.
const directory = await mkdtemp(join(tmpdir(), 'twill-workflow-'));
try {
  const path = join(directory, 'ledger.json');
  await writeFile(path, '[{"reference":"file","amountCents":50}]');
  const file = await open(path, 'r');
  const outcome = await summarizeLedger({}, async () => ({
    readText: () => file.readFile('utf8'),
    close: () => file.close(),
  }));
  assert.equal(describeOutcome(outcome), '1 payments: 50 cents');
  assert.equal(file.fd, -1, 'The owned file must close before the result resolves');
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log(
  'Workflow example: validation, safe integer totals, owned cleanup, cancellation and real file IO passed.',
);
