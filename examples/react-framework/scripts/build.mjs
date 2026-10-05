import { build } from 'vite';
import twill from '@swiftuijs/twill/vite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import './prepare.mjs';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'sources.json'), 'utf8'));
export async function buildFramework(dialect, development, write = true) {
  const directory = resolve(root, dialect ? 'src' : 'dist/native-source');
  const extension = dialect ? '.twill' : '.js';
  const files = new Map(manifest.files.map((file) => [file.path, file]));
  const start = performance.now();
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    define: { __DEV__: String(development), __EXPERIMENTAL__: 'false', __PROFILE__: 'false' },
    plugins: [
      {
        name: 'react-upstream-module-graph',
        resolveId(specifier, importer) {
          if (!importer?.replaceAll('\\', '/').startsWith(directory.replaceAll('\\', '/') + '/'))
            return;
          const path = relative(directory, importer)
            .replaceAll('\\', '/')
            .replace(/\.twill$/, '.js');
          const dependency = files.get(path)?.dependencies.find(([name]) => name === specifier);
          if (dependency) return resolve(directory, dependency[1].replace(/\.js$/, extension));
        },
      },
      ...(dialect ? [twill()] : []),
    ],
    build: {
      ssr: true,
      write,
      outDir: resolve(
        root,
        'dist',
        `${dialect ? 'twill' : 'native'}-${development ? 'development' : 'production'}`,
      ),
      emptyOutDir: true,
      target: 'es2022',
      sourcemap: true,
      rolldownOptions: { output: { entryFileNames: development ? 'index.cjs' : 'index.js' } },
      minify: !development,
      lib: {
        entry: resolve(
          directory,
          (development ? manifest.developmentEntry : manifest.entry).replace(/\.js$/, extension),
        ),
        // React's development act helper reads module.require to use Node's
        // real setImmediate. A CJS dev build preserves that upstream contract.
        formats: [development ? 'cjs' : 'es'],
        fileName: () => 'react.js',
      },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output);
  const code = outputs
    .filter((output) => output.type === 'chunk')
    .map((output) => output.code)
    .join('');
  return {
    milliseconds: performance.now() - start,
    bytes: Buffer.byteLength(code),
    sha256: createHash('sha256').update(code).digest('hex'),
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = {};
  for (const development of [true, false])
    for (const dialect of [false, true]) {
      const name = `${dialect ? 'twill' : 'native'}-${development ? 'development' : 'production'}`;
      report[name] = await buildFramework(dialect, development);
      console.log(name, report[name]);
    }
  mkdirSync(resolve(root, 'dist'), { recursive: true });
  writeFileSync(
    resolve(root, 'dist/build-report.json'),
    JSON.stringify(
      { commit: manifest.commit, modules: manifest.files.length, results: report },
      null,
      2,
    ) + '\n',
  );
}
