import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ConfigurationObservation = {
  path: string;
  kind: 'file' | 'directory';
  value: string;
};
const limit = 512 * 1024;
const packages = [
  'typescript',
  'acorn',
  'acorn-typescript',
  'acorn-jsx',
  'magic-string',
  '@ampproject/remapping',
  '@jridgewell/trace-mapping',
];
export const digest = (source: string | Uint8Array) =>
  createHash('sha256').update(source).digest('hex');

export function observe(path: string, kind: ConfigurationObservation['kind']): string {
  try {
    if (kind === 'directory') return statSync(path).isDirectory() ? 'directory' : 'absent';
    return digest(readFileSync(path));
  } catch (error) {
    return ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')
      ? 'absent'
      : 'unavailable';
  }
}
export function observationsMatch(observations: ConfigurationObservation[]): boolean {
  return observations.every(({ path, kind, value }) => {
    const current = observe(path, kind);
    return current !== 'unavailable' && current === value;
  });
}

/** Hash actual installed code without evaluating any compiler or dependency module. */
export function toolchainIdentity(
  location = import.meta.url,
  names = packages,
): string | undefined {
  try {
    const hash = createHash('sha256').update('twill-loader-cache-v1\0' + process.version);
    const add = (path: string, bytes: Uint8Array) =>
      hash.update(JSON.stringify([path, digest(bytes)]));
    const directory = dirname(fileURLToPath(location));
    for (const file of readdirSync(directory).sort())
      if (file.endsWith('.js')) add(file, readFileSync(join(directory, file)));
    const seen = new Set<string>();
    const visit = (name: string, from: string) => {
      const require = createRequire(from);
      let root = dirname(require.resolve(name));
      for (;;) {
        const metadata = join(root, 'package.json');
        if (existsSync(metadata) && JSON.parse(readFileSync(metadata, 'utf8')).name === name) break;
        const parent = dirname(root);
        if (parent === root) throw new Error('Package metadata unavailable');
        root = parent;
      }
      root = realpathSync(root);
      if (seen.has(root)) return;
      seen.add(root);
      const metadata = join(root, 'package.json');
      const value = JSON.parse(readFileSync(metadata, 'utf8'));
      add(name, readFileSync(metadata));
      const walk = (folder: string) => {
        for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) =>
          a.name.localeCompare(b.name),
        )) {
          const path = join(folder, entry.name);
          if (entry.isSymbolicLink() && statSync(path).isDirectory())
            throw new Error('Directory symlink requires uncached compilation');
          if (entry.isDirectory() && entry.name !== 'node_modules') walk(path);
          else if (/\.(?:[cm]?js|json)$/.test(entry.name))
            add(path.slice(root.length), readFileSync(path));
        }
      };
      // TypeScript emission/configuration executes this single compiler bundle;
      // hashing its CLI/server copies would add unrelated cold-start work.
      if (name === 'typescript')
        add('typescript/lib/typescript.js', readFileSync(require.resolve(name)));
      else walk(root);
      for (const dependency of Object.keys(value.dependencies ?? {}).sort())
        visit(dependency, metadata);
    };
    for (const name of names) visit(name, location);
    return hash.digest('hex');
  } catch {
    return undefined;
  }
}

function safeDirectory(directory: string): boolean {
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) return false;
  if (process.platform === 'win32') return true; // User-selected/profile ACL, not a POSIX mode claim.
  const uid = process.getuid!();
  if (info.uid !== uid || (info.mode & 0o077) !== 0) return false;
  let path = realpathSync(directory);
  for (;;) {
    const parent = lstatSync(path);
    if (parent.uid !== uid && parent.uid !== 0) return false;
    if ((parent.mode & 0o022) !== 0 && (parent.mode & 0o1000) === 0) return false;
    const next = dirname(path);
    if (next === path) return true;
    path = next;
  }
}
function safeFile(info: Stats): boolean {
  return (
    info.isFile() &&
    info.nlink === 1 &&
    info.size <= limit &&
    (process.platform === 'win32' || (info.uid === process.getuid!() && (info.mode & 0o077) === 0))
  );
}

/** Fixed slots bound completed storage; collisions are misses, never shared module results. */
export class CompilationCache {
  constructor(
    private readonly directory: string,
    private readonly identity: string,
  ) {}

  private key(url: string, source: string, dialect: boolean) {
    return digest(JSON.stringify([this.identity, url, digest(source), dialect, 'ES2022']));
  }
  private slot(url: string) {
    return join(this.directory, (parseInt(digest(url).slice(0, 2), 16) % 128) + '.json');
  }
  read(url: string, source: string, dialect: boolean): string | undefined {
    let fd: number | undefined;
    try {
      if (!safeDirectory(this.directory)) return;
      const file = this.slot(url);
      if (lstatSync(file).isSymbolicLink()) return;
      fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      if (!safeFile(fstatSync(fd))) return;
      const value = JSON.parse(readFileSync(fd, 'utf8'));
      if (
        value.key !== this.key(url, source, dialect) ||
        typeof value.source !== 'string' ||
        value.digest !== digest(value.source) ||
        !Array.isArray(value.observations) ||
        !value.observations.every(
          (entry: ConfigurationObservation) =>
            entry &&
            typeof entry.path === 'string' &&
            isAbsolute(entry.path) &&
            ['file', 'directory'].includes(entry.kind) &&
            typeof entry.value === 'string',
        ) ||
        !observationsMatch(value.observations)
      )
        return;
      return value.source;
    } catch {
      return;
    } finally {
      if (fd !== undefined) {
        try {
          closeSync(fd);
        } catch {
          /* Cache cleanup is optional too. */
        }
      }
    }
  }
  write(
    url: string,
    source: string,
    dialect: boolean,
    emitted: string,
    observations: ConfigurationObservation[],
  ): void {
    let temporary: string | undefined;
    try {
      const value = JSON.stringify({
        key: this.key(url, source, dialect),
        source: emitted,
        digest: digest(emitted),
        observations,
      });
      if (
        Buffer.byteLength(value) > limit ||
        !safeDirectory(this.directory) ||
        !observationsMatch(observations)
      )
        return;
      temporary = join(this.directory, randomUUID() + '.tmp');
      writeFileSync(temporary, value, { flag: 'wx', mode: 0o600 });
      renameSync(temporary, this.slot(url));
    } catch {
      // An executable cache is optional; its failure never changes script behavior.
    } finally {
      if (temporary !== undefined) {
        try {
          unlinkSync(temporary);
        } catch {
          // Renamed, concurrently removed, or inaccessible; never replace the program's result.
        }
      }
    }
  }
}

export function openCompilationCache(): CompilationCache | undefined {
  try {
    const directory = process.env.TWILL_CACHE_DIR ?? join(homedir(), '.twill', 'script-cache-v1');
    if (!isAbsolute(directory)) return;
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!safeDirectory(directory)) return;
    const identity = toolchainIdentity();
    if (identity) return new CompilationCache(resolve(directory), identity);
  } catch {
    // Permissions, unsupported environment or unavailable identity: compile normally.
  }
}
