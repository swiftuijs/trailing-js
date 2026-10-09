import { resolve } from 'node:path';
import { Command, Output } from '../dist/index.js';
export const size = 1024 * 1024;
const nativeFixture = resolve(import.meta.dirname, 'target/fixture');
const nodeFixture = resolve(import.meta.dirname, '../tests/fixtures/child.mjs');
const policy = (count) => Output.bytes({ limit: count });
export const workloads = [
  {
    name: 'native-executable-inherit',
    command: Command.path('/usr/bin/true'),
    options: {},
    count: 512,
  },
  {
    name: 'node-inherit',
    command: Command.path(process.execPath, ['-e', '']),
    options: {},
    count: 96,
  },
  ...[size, 8 * size].map((bytes) => ({
    name: `native-dual-capture-${bytes}`,
    command: Command.path(nativeFixture, ['emit', String(bytes)]),
    options: { output: policy(bytes), error: policy(bytes) },
    count: bytes === size ? 64 : 16,
    expected: Buffer.alloc(bytes, 97),
    expectedError: Buffer.alloc(bytes, 98),
  })),
  {
    name: 'node-dual-capture-1048576',
    command: Command.path(process.execPath, [nodeFixture, 'large', String(size)]),
    options: { output: policy(size), error: policy(size) },
    count: 16,
    expected: Buffer.alloc(size, 97),
    expectedError: Buffer.alloc(size, 98),
  },
  {
    name: 'native-stdin-text-1048576',
    command: Command.path(nativeFixture, ['echo']),
    options: { input: 'x'.repeat(size), output: Output.text({ limit: size }) },
    count: 64,
    expected: 'x'.repeat(size),
  },
  {
    name: 'native-duplex-1048576',
    command: Command.path(nativeFixture, ['duplex']),
    options: { input: Buffer.alloc(size, 255), output: policy(size), error: policy(size) },
    count: 64,
    expected: Buffer.alloc(size, 255),
    expectedError: Buffer.alloc(size, 255),
  },
];
