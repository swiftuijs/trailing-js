import { expect, it } from 'vitest';
import { Environment } from '../src/index.twill';
import { environmentSnapshot } from '../src/environment.twill';
it('snapshots the complete inherited environment and follows Node coverage propagation', () => {
  const parent = { PATH: '/path', CUSTOM: 'before', NODE_V8_COVERAGE: '/coverage' };
  const snapshot = environmentSnapshot(undefined, 'linux', parent);
  parent.CUSTOM = 'after';
  expect(snapshot.CUSTOM).toBe('before');
  expect(environmentSnapshot(Environment.replace({ ONLY: 'selected' }), 'linux', parent)).toEqual({
    ONLY: 'selected',
    NODE_V8_COVERAGE: '/coverage',
  });
  expect(
    environmentSnapshot(Environment.replace({ NODE_V8_COVERAGE: '' }), 'linux', parent)
      .NODE_V8_COVERAGE,
  ).toBe('');
  expect(environmentSnapshot(Environment.replace({}), 'linux', {})).toEqual({});
});
it('matches mandatory Windows defaults while retaining case-insensitive explicit overrides and empty values', () => {
  const parent = {
    Path: 'parent-path',
    SystemRoot: 'root',
    TEMP: 'temp',
    USERPROFILE: 'profile',
    SECRET: 'omitted',
  };
  expect(
    environmentSnapshot(Environment.replace({ path: 'selected-path', temp: '' }), 'win32', parent),
  ).toEqual({ path: 'selected-path', temp: '', SYSTEMROOT: 'root', USERPROFILE: 'profile' });
  expect(environmentSnapshot(Environment.replace({}), 'win32', parent)).toEqual({
    PATH: 'parent-path',
    SYSTEMROOT: 'root',
    TEMP: 'temp',
    USERPROFILE: 'profile',
  });
});

import { cwdSnapshot } from '../src/cwd.twill';
it('preserves POSIX symlink traversal and snapshots Windows absolute/relative drive resolution', () => {
  expect(cwdSnapshot(undefined, 'linux', '/work')).toBe('/work');
  expect(cwdSnapshot('/path/link/..', 'linux', '/work')).toBe('/path/link/..');
  expect(cwdSnapshot('link/..', 'linux', '/work')).toBe('/work/link/..');
  expect(cwdSnapshot('child', 'win32', 'C:\\work')).toBe('C:\\work\\child');
  expect(cwdSnapshot('D:\\other', 'win32', 'C:\\work')).toBe('D:\\other');
});
