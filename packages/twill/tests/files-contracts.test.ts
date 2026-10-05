import { afterEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { resolveSourceFile } from '../src/files';

vi.mock('node:fs', async (original) => ({ ...(await original<typeof fs>()) }));
afterEach(() => vi.restoreAllMocks());
it.each(['EACCES', undefined])(
  'does not hide filesystem failures with code %s as missing sources',
  (code) => {
    const failure = Object.assign(new Error('filesystem request failed'), { code });
    vi.spyOn(fs, 'statSync').mockImplementation(() => {
      throw failure;
    });
    expect(() => resolveSourceFile('/private/main')).toThrow(failure);
  },
);
