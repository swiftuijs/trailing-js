import { isAbsolute, win32 } from 'node:path';
export function cwdSnapshot(
  cwd: string | undefined,
  platform = process.platform,
  parent = process.cwd(),
): string {
  return cwd === undefined
    ? parent
    : platform === 'win32'
      ? win32.resolve(parent, cwd)
      : isAbsolute(cwd)
        ? cwd
        : `${parent}/${cwd}`;
}
