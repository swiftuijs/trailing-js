import { processLibc } from './libc.js';
const nodeReport = () => process.report.getReport();
/** Select the ABI of the running Node process, without load retries or overrides. */
export function nativeTarget(
  platform: string = process.platform,
  architecture: string = process.arch,
  report: () => unknown = nodeReport,
): string {
  if (!['linux', 'darwin', 'win32'].includes(platform) || !['x64', 'arm64'].includes(architecture))
    throw new Error(`Unsupported native subprocess platform: ${platform}-${architecture}`);
  if (platform !== 'linux') return `${platform}-${architecture}`;
  const libc = report === nodeReport ? processLibc() : undefined;
  if (libc) return `linux-${architecture}${libc === 'musl' ? '-musl' : ''}`;
  const value = report() as { header?: { glibcVersionRuntime?: unknown } } | null;
  if (!value || typeof value.header !== 'object' || value.header === null)
    throw new Error('Cannot identify the running Node process Linux ABI');
  const glibc = value.header.glibcVersionRuntime;
  if (glibc === undefined) return `linux-${architecture}-musl`;
  if (typeof glibc !== 'string' || glibc.length === 0)
    throw new Error('Cannot identify the running Node process Linux ABI');
  return `linux-${architecture}`;
}
