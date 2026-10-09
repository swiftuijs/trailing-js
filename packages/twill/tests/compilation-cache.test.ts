import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CompilationCache,
  digest,
  observe,
  observationsMatch,
  openCompilationCache,
  toolchainIdentity,
} from '../src/compilation-cache';
import { loaderConfiguration } from '../src/configuration';
import ts from 'typescript';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = fs.mkdtempSync(join(tmpdir(), 'twill-compilation-cache-'));
  roots.push(root);
  const directory = join(root, 'cache');
  fs.mkdirSync(directory, { mode: 0o700 });
  const cache = new CompilationCache(directory, 'build-one');
  const file = join(root, 'main.twill');
  const url = pathToFileURL(file).href;
  fs.writeFileSync(file, 'source');
  const observations = [{ path: file, kind: 'file' as const, value: observe(file, 'file') }];
  return { root, directory, file, url, cache, observations };
}
function entry(directory: string) {
  return join(
    directory,
    fs.readdirSync(directory).find((file) => file.endsWith('.json'))!,
  );
}
it('reuses parsed runner config while validating bytes, optional probes and cache bounds', () => {
  const { root, file } = fixture();
  const inherited = join(root, 'base.json');
  fs.writeFileSync(inherited, '{"compilerOptions":{"jsxImportSource":"one"}}');
  fs.writeFileSync(join(root, 'tsconfig.json'), '{"extends":"./base.json"}');
  const probes = vi.spyOn(ts.sys, 'fileExists');
  expect(loaderConfiguration(file).config.jsxImportSource).toBe('one');
  const first = probes.mock.calls.length;
  expect(first).toBeGreaterThan(0);
  expect(loaderConfiguration(join(root, 'second.twill')).config.jsxImportSource).toBe('one');
  expect(probes.mock.calls.length).toBe(first);
  const time = fs.statSync(inherited);
  fs.writeFileSync(inherited, '{"compilerOptions":{"jsxImportSource":"two"}}');
  fs.utimesSync(inherited, time.atime, time.mtime);
  expect(loaderConfiguration(file).config.jsxImportSource).toBe('two');
  expect(probes.mock.calls.length).toBeGreaterThan(first);
  const nested = join(root, 'nested');
  fs.mkdirSync(nested);
  const child = join(nested, 'main.twill');
  expect(loaderConfiguration(child).config.jsxImportSource).toBe('two');
  fs.writeFileSync(join(nested, 'twill.config.json'), '{"implicitReturn":false}');
  expect(loaderConfiguration(child).config.implicitReturn).toBe(false);
  fs.writeFileSync(join(nested, 'twill.config.json'), '{"implicitReturn":"bad"}');
  expect(() => loaderConfiguration(child)).toThrow('implicitReturn must be a boolean');
  fs.rmSync(join(nested, 'twill.config.json'));
  expect(loaderConfiguration(child).config.implicitReturn).toBeUndefined();
  for (let index = 0; index < 65; index++) {
    const directory = join(root, 'module' + index);
    fs.mkdirSync(directory);
    loaderConfiguration(join(directory, 'main.twill'));
  }
  const before = probes.mock.calls.length;
  loaderConfiguration(file);
  expect(probes.mock.calls.length).toBeGreaterThan(before);
});
it('stores exactly emitted bytes and distinguishes source, URL, dialect and rebuilt code', () => {
  const { directory, url, cache, observations } = fixture();
  expect(cache.read(url, 'source', true)).toBeUndefined();
  const emitted =
    'throw new Error("original");\n//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozfQ==';
  cache.write(url, 'source', true, emitted, observations);
  expect(cache.read(url, 'source', true)).toBe(emitted);
  expect(cache.read(url, 'changed', true)).toBeUndefined();
  expect(cache.read(url, 'source', false)).toBeUndefined();
  expect(cache.read(url + '?query#fragment', 'source', true)).toBeUndefined();
  expect(new CompilationCache(directory, 'build-two').read(url, 'source', true)).toBeUndefined();
  expect(fs.readdirSync(directory)).toHaveLength(1);
  if (process.platform !== 'win32') expect(fs.statSync(entry(directory)).mode & 0o777).toBe(0o600);
});
it('checks contents with preserved timestamps and creation/deletion, not metadata alone', () => {
  const { file, url, cache, observations } = fixture();
  const time = fs.statSync(file);
  cache.write(url, 'source', true, 'compiled', observations);
  fs.writeFileSync(file, 'change');
  fs.utimesSync(file, time.atime, time.mtime);
  expect(cache.read(url, 'source', true)).toBeUndefined();
  fs.rmSync(file);
  expect(observe(file, 'file')).toBe('absent');
  const missing = [{ path: file, kind: 'file' as const, value: 'absent' }];
  cache.write(url, 'source', true, 'missing-config', missing);
  expect(cache.read(url, 'source', true)).toBe('missing-config');
  fs.writeFileSync(file, 'new');
  expect(cache.read(url, 'source', true)).toBeUndefined();
  cache.write(url, 'source', true, 'stale', missing);
  expect(cache.read(url, 'source', true)).toBeUndefined();
});
it.each([
  null,
  { observations: {} },
  { observations: [null] },
  { observations: [{ path: 'relative', kind: 'file', value: 'absent' }] },
  { observations: [{ path: '/file', kind: 'unknown', value: 'absent' }] },
  { observations: [{ path: '/file', kind: 'file', value: 123 }] },
  { source: 123 },
  { digest: 'corrupted' },
])('treats a malformed cache record as a miss: %j', (change) => {
  const { directory, url, cache } = fixture();
  cache.write(url, 'source', true, 'compiled', []);
  const path = entry(directory);
  const value = JSON.parse(fs.readFileSync(path, 'utf8'));
  fs.writeFileSync(path, JSON.stringify(change === null ? null : { ...value, ...change }));
  expect(cache.read(url, 'source', true)).toBeUndefined();
});
it('recovers from incomplete JSON and oversized records without retaining oversized output', () => {
  const { directory, url, cache } = fixture();
  cache.write(url, 'source', true, 'compiled', []);
  const path = entry(directory);
  fs.writeFileSync(path, '{');
  expect(cache.read(url, 'source', true)).toBeUndefined();
  fs.writeFileSync(path, 'x'.repeat(512 * 1024 + 1));
  expect(cache.read(url, 'source', true)).toBeUndefined();
  cache.write(url, 'source', true, 'x'.repeat(512 * 1024), []);
  expect(fs.statSync(path).size).toBe(512 * 1024 + 1);
});
it('bounds storage with fixed slots and safely replaces colliding identities', () => {
  const { directory, cache } = fixture();
  for (let i = 0; i < 300; i++)
    cache.write('file:///module-' + i, 'source', true, 'result-' + i, []);
  expect(fs.readdirSync(directory).length).toBeLessThanOrEqual(128);
  const latest = 'file:///module-299';
  expect(cache.read(latest, 'source', true)).toBe('result-299');
});
it.skipIf(process.platform === 'win32')(
  'rejects symlinks, hard links and readable/nonprivate files or directories',
  () => {
    const { root, directory, url, cache } = fixture();
    cache.write(url, 'source', true, 'compiled', []);
    const path = entry(directory);
    const target = join(root, 'original');
    fs.renameSync(path, target);
    fs.symlinkSync(target, path);
    expect(cache.read(url, 'source', true)).toBeUndefined();
    cache.write(url, 'source', true, 'new', []);
    expect(fs.readFileSync(target, 'utf8')).toContain('compiled');
    expect(cache.read(url, 'source', true)).toBe('new');
    fs.unlinkSync(path);
    fs.linkSync(target, path);
    expect(cache.read(url, 'source', true)).toBeUndefined();
    fs.unlinkSync(path);
    fs.renameSync(target, path);
    fs.chmodSync(path, 0o644);
    expect(cache.read(url, 'source', true)).toBeUndefined();
    fs.chmodSync(directory, 0o755);
    expect(cache.read(url, 'source', true)).toBeUndefined();
    cache.write(url, 'source', true, 'unsafe', []);
    expect(fs.readFileSync(path, 'utf8')).not.toContain('unsafe');
    const link = join(root, 'linked');
    fs.symlinkSync(directory, link);
    vi.stubEnv('TWILL_CACHE_DIR', link);
    expect(openCompilationCache()).toBeUndefined();
  },
);
it.skipIf(process.platform === 'win32')(
  'rejects an unsafe ancestor rather than repairing its permissions',
  () => {
    const { root, directory } = fixture();
    fs.chmodSync(root, 0o777);
    vi.stubEnv('TWILL_CACHE_DIR', directory);
    expect(openCompilationCache()).toBeUndefined();
    expect(fs.statSync(root).mode & 0o777).toBe(0o777);
  },
);
it('falls back for relative/unavailable locations and ignores cache I/O cleanup faults', () => {
  const { directory, url, cache } = fixture();
  vi.stubEnv('TWILL_CACHE_DIR', 'relative-cache');
  expect(openCompilationCache()).toBeUndefined();
  vi.stubEnv('TWILL_CACHE_DIR', directory);
  cache.write(url, 'source', true, 'compiled', []);
  const realClose = fs.closeSync;
  const close = vi.spyOn(fs, 'closeSync').mockImplementationOnce((fd) => {
    realClose(fd);
    throw new Error('close');
  });
  syncBuiltinESMExports();
  expect(cache.read(url, 'source', true)).toBe('compiled');
  close.mockRestore();
  syncBuiltinESMExports();
  const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
    throw new Error('rename');
  });
  syncBuiltinESMExports();
  cache.write(url, 'source', true, 'new', []);
  expect(fs.readdirSync(directory)).toHaveLength(1);
  expect(cache.read(url, 'source', true)).toBe('compiled');
  rename.mockRestore();
  syncBuiltinESMExports();
  vi.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => {
    throw new Error('unavailable');
  });
  syncBuiltinESMExports();
  expect(openCompilationCache()).toBeUndefined();
});
it('opens a private cache using the actual installed toolchain and bypasses unavailable identity', () => {
  const { directory } = fixture();
  vi.stubEnv('TWILL_CACHE_DIR', directory);
  expect(openCompilationCache()).toBeInstanceOf(CompilationCache);
});
it.skipIf(process.platform === 'win32')(
  'rejects foreign-owned cache locations and nonregular entries',
  () => {
    const { directory, url, cache } = fixture();
    cache.write(url, 'source', true, 'compiled', []);
    const path = entry(directory);
    fs.rmSync(path);
    fs.mkdirSync(path);
    expect(cache.read(url, 'source', true)).toBeUndefined();
    vi.stubEnv('TWILL_CACHE_DIR', directory);
    const uid = process.getuid!();
    vi.spyOn(process, 'getuid').mockReturnValue(uid + 1);
    expect(openCompilationCache()).toBeUndefined();
  },
);
it('observes files, directories and absence independently', () => {
  const { root, file } = fixture();
  expect(observe(root, 'directory')).toBe('directory');
  expect(observe(file, 'directory')).toBe('absent');
  expect(observe(join(root, 'absent'), 'directory')).toBe('absent');
  expect(observationsMatch([{ path: root, kind: 'directory', value: 'directory' }])).toBe(true);
});
it('fingerprints rebuilt artifacts and actual dependency bytes without importing compiler code', () => {
  const { root } = fixture();
  const location = pathToFileURL(join(root, 'loader.js')).href;
  fs.writeFileSync(join(root, 'loader.js'), 'export const value = 1;');
  const first = toolchainIdentity(location, []);
  expect(first).toMatch(/^[a-f0-9]{64}$/);
  fs.writeFileSync(join(root, 'loader.js'), 'export const value = 2;');
  expect(toolchainIdentity(location, [])).not.toBe(first);
  expect(toolchainIdentity(location, ['nonexistent-twill-package'])).toBeUndefined();
  expect(toolchainIdentity(pathToFileURL(join(root, 'absent/loader.js')).href, [])).toBeUndefined();
  const pkg = join(root, 'node_modules', 'test-compiler');
  fs.mkdirSync(join(pkg, 'lib'), { recursive: true });
  fs.writeFileSync(join(pkg, 'package.json'), '{"name":"test-compiler","main":"lib/index.js"}');
  fs.writeFileSync(join(pkg, 'lib/index.js'), 'throw new Error("must not evaluate");');
  const dependency = toolchainIdentity(location, ['test-compiler']);
  expect(dependency).toMatch(/^[a-f0-9]{64}$/);
  fs.writeFileSync(join(pkg, 'lib/index.js'), 'throw new Error("changed, same version");');
  expect(toolchainIdentity(location, ['test-compiler'])).not.toBe(dependency);
});
it.each(['utf8', 'utf8-bom', 'utf16le', 'utf16be'])(
  'tracks the exact config bytes with %s decoding',
  (encoding) => {
    const { root, file } = fixture();
    const text = '{"compilerOptions":{"jsxImportSource":"vue"}}';
    const bytes = encoding.startsWith('utf16')
      ? Buffer.concat([Buffer.from([255, 254]), Buffer.from(text, 'utf16le')])
      : Buffer.from((encoding === 'utf8-bom' ? '\ufeff' : '') + text);
    if (encoding === 'utf16be') bytes.swap16();
    const config = join(root, 'tsconfig.json');
    fs.writeFileSync(config, bytes);
    const result = loaderConfiguration(file);
    expect(result.config.jsxImportSource).toBe('vue');
    expect(result.observations).toContainEqual({
      path: config,
      kind: 'file',
      value: digest(bytes),
    });
    expect(observationsMatch(result.observations)).toBe(true);
  },
);
it('records inherited config and missing package/config probes for subsequent invalidation', () => {
  const { root, file } = fixture();
  const pkg = join(root, 'node_modules', 'base-config');
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(join(pkg, 'package.json'), '{"name":"base-config","tsconfig":"base.json"}');
  const inherited = join(pkg, 'base.json');
  fs.writeFileSync(inherited, '{"compilerOptions":{"jsxImportSource":"vue"}}');
  fs.writeFileSync(join(root, 'tsconfig.json'), '{"extends":"base-config"}');
  const first = loaderConfiguration(file);
  expect(first.config.jsxImportSource).toBe('vue');
  expect(first.observations.some((o) => o.path === inherited)).toBe(true);
  fs.writeFileSync(inherited, '{"compilerOptions":{"jsxImportSource":"react"}}');
  expect(observationsMatch(first.observations)).toBe(false);
  const second = loaderConfiguration(file);
  expect(second.config.jsxImportSource).toBe('react');
  fs.rmSync(inherited);
  const missing = loaderConfiguration(file);
  fs.writeFileSync(inherited, '{"compilerOptions":{"jsxImportSource":"react"}}');
  expect(observationsMatch(missing.observations)).toBe(false);
});

it('keeps file boundaries in fingerprints when code bytes move between artifacts', () => {
  const { root } = fixture();
  const location = pathToFileURL(join(root, 'loader.js')).href;
  fs.writeFileSync(join(root, 'a.js'), '//');
  fs.writeFileSync(join(root, 'b.js'), '//b.jsz\n');
  const first = toolchainIdentity(location, []);
  fs.writeFileSync(join(root, 'a.js'), '//b.js//');
  fs.writeFileSync(join(root, 'b.js'), 'z\n');
  expect(toolchainIdentity(location, [])).not.toBe(first);
});

it('does not confuse unreadable configuration with absence or cache failed observations', () => {
  const { file, url, cache } = fixture();
  const read = vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
    throw Object.assign(new Error('denied'), { code: 'EACCES' });
  });
  syncBuiltinESMExports();
  expect(observe(file, 'file')).toBe('unavailable');
  read.mockRestore();
  syncBuiltinESMExports();
  expect(observationsMatch([{ path: file, kind: 'file', value: 'unavailable' }])).toBe(false);
  cache.write(url, 'source', true, 'bad', [{ path: file, kind: 'file', value: 'unavailable' }]);
  expect(cache.read(url, 'source', true)).toBeUndefined();
});

it('includes parent package code when an entry directory has its own module-type metadata', () => {
  const { root } = fixture();
  const location = pathToFileURL(join(root, 'loader.js')).href;
  const pkg = join(root, 'node_modules', 'nested-compiler');
  fs.mkdirSync(join(pkg, 'lib'), { recursive: true });
  fs.writeFileSync(join(pkg, 'package.json'), '{"name":"nested-compiler","main":"lib/index.js"}');
  fs.writeFileSync(join(pkg, 'lib', 'package.json'), '{"type":"commonjs"}');
  fs.writeFileSync(join(pkg, 'lib', 'index.js'), 'module.exports = require("../helper.js");');
  fs.writeFileSync(join(pkg, 'helper.js'), 'module.exports=1;');
  const first = toolchainIdentity(location, ['nested-compiler']);
  expect(first).toMatch(/^[a-f0-9]{64}$/);
  fs.writeFileSync(join(pkg, 'helper.js'), 'module.exports=2;');
  expect(toolchainIdentity(location, ['nested-compiler'])).not.toBe(first);
});
it.skipIf(process.platform === 'win32')(
  'falls back for dependency directory symlinks rather than omitting their code',
  () => {
    const { root } = fixture();
    const location = pathToFileURL(join(root, 'loader.js')).href;
    const pkg = join(root, 'node_modules', 'linked-compiler');
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(join(pkg, 'package.json'), '{"name":"linked-compiler","main":"index.js"}');
    fs.writeFileSync(join(pkg, 'index.js'), 'module.exports = require("./lib/helper.js");');
    const outside = join(root, 'external');
    fs.mkdirSync(outside);
    fs.writeFileSync(join(outside, 'helper.js'), 'module.exports=1;');
    fs.symlinkSync(outside, join(pkg, 'lib'));
    expect(toolchainIdentity(location, ['linked-compiler'])).toBeUndefined();
  },
);
