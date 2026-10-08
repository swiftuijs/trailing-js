import { openSync, readSync, closeSync } from 'node:fs';

/** Bounded inspection of the running executable; unknown layouts use Node's report. */
export function processLibc(executable = '/proc/self/exe'): 'glibc' | 'musl' | undefined {
  let fd: number;
  try {
    fd = openSync(executable, 'r');
  } catch {
    return undefined;
  }
  try {
    const read = (length: number, position: number): Buffer | undefined => {
      const bytes = Buffer.alloc(length);
      let offset = 0;
      while (offset < length) {
        const count = readSync(fd, bytes, offset, length - offset, position + offset);
        if (count === 0) return undefined;
        offset += count;
      }
      return bytes;
    };
    const header = read(64, 0);
    if (!header || !header.subarray(0, 7).equals(Buffer.from([127, 69, 76, 70, 2, 1, 1])))
      return undefined;
    const machine = header.readUInt16LE(18);
    if (machine !== 62 && machine !== 183) return undefined;
    if (
      ![2, 3].includes(header.readUInt16LE(16)) ||
      header.readUInt32LE(20) !== 1 ||
      header.readUInt16LE(52) !== 64
    )
      return undefined;
    const entries = header.readUInt16LE(56);
    const start = header.readBigUInt64LE(32);
    if (
      header.readUInt16LE(54) !== 56 ||
      entries === 0 ||
      entries > 128 ||
      start < 64n ||
      start > BigInt(Number.MAX_SAFE_INTEGER - entries * 56)
    )
      return undefined;
    for (let index = 0; index < entries; index++) {
      const entry = read(56, Number(start) + index * 56);
      if (!entry) return undefined;
      if (entry.readUInt32LE(0) !== 3) continue;
      const position = entry.readBigUInt64LE(8);
      const length = entry.readBigUInt64LE(32);
      if (length < 2n || length > 4096n || position > BigInt(Number.MAX_SAFE_INTEGER - 4096))
        return undefined;
      const bytes = read(Number(length), Number(position));
      if (!bytes || bytes.at(-1) !== 0) return undefined;
      const interpreter = bytes.subarray(0, -1).toString('utf8');
      if (!interpreter.startsWith('/') || interpreter.includes('\0')) return undefined;
      const arch = machine === 62 ? 'x86_64' : 'aarch64';
      if (interpreter.endsWith(`/ld-musl-${arch}.so.1`)) return 'musl';
      if (interpreter.endsWith(machine === 62 ? '/ld-linux-x86-64.so.2' : '/ld-linux-aarch64.so.1'))
        return 'glibc';
      return undefined;
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    closeSync(fd);
  }
}
