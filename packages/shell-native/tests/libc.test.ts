import { afterAll, afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processLibc } from '../src/libc.twill';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual, readSync: vi.fn(actual.readSync), closeSync: vi.fn(actual.closeSync) };
});
const folder = fs.mkdtempSync(join(tmpdir(), 'twill-libc-'));
afterAll(() => fs.rmSync(folder, { recursive: true, force: true }));
let serial = 0;
afterEach(() => {
  vi.mocked(fs.readSync).mockReset();
  vi.mocked(fs.closeSync).mockClear();
});
// Restore real reads after each test, including fault injection.
const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
afterEach(() => {
  vi.mocked(fs.readSync).mockImplementation(actual.readSync);
});
afterEach(() => {
  for (const name of fs.readdirSync(folder)) fs.rmSync(join(folder, name));
});
function image(interpreter: string | undefined = '/lib64/ld-linux-x86-64.so.2', machine = 62) {
  const bytes = Buffer.alloc(512);
  Buffer.from([127, 69, 76, 70, 2, 1, 1]).copy(bytes);
  bytes.writeUInt16LE(machine, 18);
  bytes.writeUInt16LE(3, 16);
  bytes.writeUInt32LE(1, 20);
  bytes.writeUInt16LE(64, 52);
  bytes.writeBigUInt64LE(64n, 32);
  bytes.writeUInt16LE(56, 54);
  bytes.writeUInt16LE(interpreter === undefined ? 1 : 2, 56);
  if (interpreter !== undefined) {
    // A non-interpreter header precedes PT_INTERP.
    bytes.writeUInt32LE(3, 120);
    bytes.writeBigUInt64LE(256n, 128);
    bytes.writeBigUInt64LE(BigInt(Buffer.byteLength(interpreter) + 1), 152);
    bytes.write(interpreter, 256);
  }
  return bytes;
}
function inspect(bytes: Buffer) {
  const filename = join(folder, String(serial++));
  fs.writeFileSync(filename, bytes);
  const result = processLibc(filename);
  expect(fs.closeSync).toHaveBeenCalledOnce();
  return result;
}
it.each([
  ['/lib64/ld-linux-x86-64.so.2', 62, 'glibc'],
  ['/lib/ld-linux-aarch64.so.1', 183, 'glibc'],
  ['/lib/ld-musl-x86_64.so.1', 62, 'musl'],
  ['/lib/ld-musl-aarch64.so.1', 183, 'musl'],
] as const)(
  'identifies %s through bounded reads and closes the file',
  (interpreter, machine, libc) => {
    expect(inspect(image(interpreter, machine))).toBe(libc);
    expect(
      vi
        .mocked(fs.readSync)
        .mock.calls.reduce((sum, call) => sum + Number((call as readonly unknown[])[3]), 0),
    ).toBeLessThan(4096);
  },
);
it('returns unknown for unavailable files without closing an unowned descriptor', () => {
  expect(processLibc(join(folder, 'missing'))).toBeUndefined();
  expect(fs.closeSync).not.toHaveBeenCalled();
});
it.each([
  'header',
  'class',
  'endian',
  'version',
  'machine',
  'type',
  'elf-version',
  'header-size',
  'early-table',
  'empty',
  'many',
  'stride',
  'table-offset',
  'table-truncated',
  'interpreter-offset',
  'interpreter-empty',
  'interpreter-long',
  'interpreter-truncated',
  'nul',
  'embedded-nul',
  'relative',
  'unknown',
  'static',
])('rejects %s layouts and closes ownership before falling back', (kind) => {
  let bytes = image();
  switch (kind) {
    case 'header':
      bytes[0] = 0;
      break;
    case 'class':
      bytes[4] = 1;
      break;
    case 'endian':
      bytes[5] = 2;
      break;
    case 'version':
      bytes[6] = 0;
      break;
    case 'machine':
      bytes.writeUInt16LE(3, 18);
      break;
    case 'type':
      bytes.writeUInt16LE(0, 16);
      break;
    case 'elf-version':
      bytes.writeUInt32LE(0, 20);
      break;
    case 'header-size':
      bytes.writeUInt16LE(0, 52);
      break;
    case 'early-table':
      bytes.writeBigUInt64LE(1n, 32);
      break;
    case 'empty':
      bytes.writeUInt16LE(0, 56);
      break;
    case 'many':
      bytes.writeUInt16LE(129, 56);
      break;
    case 'stride':
      bytes.writeUInt16LE(64, 54);
      break;
    case 'table-offset':
      bytes.writeBigUInt64LE(2n ** 63n, 32);
      break;
    case 'table-truncated':
      bytes = bytes.subarray(0, 80);
      break;
    case 'interpreter-offset':
      bytes.writeBigUInt64LE(2n ** 63n, 128);
      break;
    case 'interpreter-empty':
      bytes.writeBigUInt64LE(1n, 152);
      break;
    case 'interpreter-long':
      bytes.writeBigUInt64LE(4097n, 152);
      break;
    case 'interpreter-truncated':
      bytes = bytes.subarray(0, 260);
      break;
    case 'nul':
      bytes[256 + Buffer.byteLength('/lib64/ld-linux-x86-64.so.2')] = 1;
      break;
    case 'embedded-nul':
      bytes = image('/other\0/lib64/ld-linux-x86-64.so.2');
      break;
    case 'relative':
      bytes = image('lib/ld-musl-x86_64.so.1');
      break;
    case 'unknown':
      bytes = image('/lib/unknown-loader.so');
      break;
    case 'static':
      bytes = image();
      bytes.writeUInt16LE(1, 56);
      break;
  }
  expect(inspect(bytes)).toBeUndefined();
});
it('handles short reads and closes descriptors after I/O errors', () => {
  vi.mocked(fs.readSync).mockImplementation(((
    fd: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position: number,
  ) => actual.readSync(fd, buffer, offset, Math.min(length, 3), position)) as typeof fs.readSync);
  expect(inspect(image())).toBe('glibc');
  vi.mocked(fs.closeSync).mockClear();
  vi.mocked(fs.readSync).mockImplementation(() => {
    throw Error('read failed');
  });
  expect(inspect(image())).toBeUndefined();
});
it('rejects a truncated ELF header without retaining its descriptor', () => {
  expect(inspect(Buffer.alloc(10))).toBeUndefined();
});
it.skipIf(process.platform !== 'linux')(
  'matches the actual running Node ABI without a diagnostic report',
  () => {
    expect(processLibc()).toBe(
      (process.report.getReport() as { header: { glibcVersionRuntime?: string } }).header
        .glibcVersionRuntime
        ? 'glibc'
        : 'musl',
    );
  },
);
