import { expect, it, vi } from 'vitest';
import { nativeTarget } from '../src/platform.js';
import * as executable from '../src/libc.js';
import { targets, rustTargets } from '../scripts/identity.mjs';

it.each(['x64', 'arm64'])('selects each Linux ABI for %s without probing libraries', (arch) => {
  expect(nativeTarget('linux', arch, () => ({ header: { glibcVersionRuntime: '2.28' } }))).toBe(
    `linux-${arch}`,
  );
  expect(nativeTarget('linux', arch, () => ({ header: {} }))).toBe(`linux-${arch}-musl`);
});
it.each(['darwin', 'win32'])('selects both %s architectures without a Linux report', (platform) => {
  const report = vi.fn(() => {
    throw new Error('unexpected probe');
  });
  for (const arch of ['x64', 'arm64'])
    expect(nativeTarget(platform, arch, report)).toBe(`${platform}-${arch}`);
  expect(report).not.toHaveBeenCalled();
});
it('uses the Node process report when executable inspection is unavailable', () => {
  const inspect = vi.spyOn(executable, 'processLibc').mockReturnValue(undefined);
  const report = vi.spyOn(process.report, 'getReport').mockReturnValue({
    header: { glibcVersionRuntime: '2.28' },
  });
  try {
    expect(nativeTarget('linux', 'x64')).toBe('linux-x64');
    expect(report).toHaveBeenCalledOnce();
  } finally {
    report.mockRestore();
    inspect.mockRestore();
  }
});
it.each(['glibc', 'musl'] as const)(
  'avoids the diagnostic report for an identified %s executable',
  (libc) => {
    const inspect = vi.spyOn(executable, 'processLibc').mockReturnValue(libc);
    const report = vi.spyOn(process.report, 'getReport').mockImplementation(() => {
      throw Error('diagnostic report must remain lazy');
    });
    try {
      expect(nativeTarget('linux', 'x64')).toBe(libc === 'musl' ? 'linux-x64-musl' : 'linux-x64');
      expect(report).not.toHaveBeenCalled();
    } finally {
      inspect.mockRestore();
      report.mockRestore();
    }
  },
);
it.each([
  null,
  undefined,
  {},
  { header: null },
  { header: 'unknown' },
  { header: { glibcVersionRuntime: '' } },
  { header: { glibcVersionRuntime: 2.28 } },
])('rejects an unidentifiable ABI: %j', (report) => {
  expect(() => nativeTarget('linux', 'x64', () => report)).toThrow('Cannot identify');
});
it.each([
  ['freebsd', 'x64'],
  ['linux', 'arm'],
  ['win32', 'ia32'],
  ['darwin', 'riscv64'],
])('rejects unsupported %s/%s before reporting or loading', (platform, arch) => {
  const report = vi.fn();
  expect(() => nativeTarget(platform, arch, report)).toThrow(
    'Unsupported native subprocess platform',
  );
  expect(report).not.toHaveBeenCalled();
});
it('has exactly one Rust target for every selectable supported ABI', () => {
  const selected = ['x64', 'arm64'].flatMap((arch) => [
    nativeTarget('linux', arch, () => ({ header: { glibcVersionRuntime: '2.28' } })),
    nativeTarget('linux', arch, () => ({ header: {} })),
    nativeTarget('darwin', arch),
    nativeTarget('win32', arch),
  ]);
  expect([...new Set(selected)].sort()).toEqual([...targets].sort());
  expect(new Set(Object.values(rustTargets)).size).toBe(8);
  expect(targets).toContain(nativeTarget());
});
