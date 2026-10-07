import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { transform } from '../dist/index.js';
export const runtimeRoot = fileURLToPath(new URL('../', import.meta.url));
export const dynamicSource =
  'function run(input,record){for(let i=0;i<input;i++)defer {record(i);}return input;}';
export const dynamicNative =
  'function run(input,record){let stack;try{for(let i=0;i<input;i++)(stack??=[]).push(()=>{record(i);});return input;}finally{let failed=false,failure;while(stack?.length){const cleanup=stack.pop();if(cleanup){try{cleanup();}catch(error){failed=true;failure=error;}}}if(failed)throw failure;}}';
export function emittedRuntime(source, runtime) {
  return transform(source, { language: 'js', runtime }).code;
}
export async function bundleScopes(count, runtime) {
  const start = performance.now();
  const result = await build({
    entryPoints: ['virtual-runtime-application'],
    bundle: true,
    minify: true,
    write: false,
    metafile: true,
    format: 'esm',
    target: 'es2022',
    plugins: [
      {
        name: 'runtime-size-fixtures',
        setup(b) {
          b.onResolve({ filter: /^virtual-runtime-application$/ }, () => ({
            path: 'entry',
            namespace: 'runtime-fixture',
          }));
          b.onResolve({ filter: /^scope\d+$/ }, (args) => ({
            path: args.path,
            namespace: 'runtime-fixture',
          }));
          b.onLoad({ filter: /.*/, namespace: 'runtime-fixture' }, (args) => ({
            contents:
              args.path === 'entry'
                ? Array.from(
                    { length: count },
                    (_, i) => `export {run${i}} from 'scope${i}';`,
                  ).join('\n')
                : emittedRuntime(
                    `export function run${args.path.slice(5)}(events,early,bad){defer {events.push(1);if(bad)throw undefined;}if(early)return 7;defer {events.push(2);}return 8;}`,
                    runtime,
                  ),
            loader: 'js',
            resolveDir: runtimeRoot,
          }));
        },
      },
    ],
  });
  return {
    code: result.outputFiles[0].text,
    inputs: Object.keys(result.metafile.inputs),
    buildMs: performance.now() - start,
  };
}
export async function bundleHelper() {
  return await build({
    stdin: {
      contents: "export {runDefers} from '@swiftuijs/twill-runtime/helpers/v1';",
      resolveDir: runtimeRoot,
    },
    bundle: true,
    minify: true,
    write: false,
    metafile: true,
    format: 'esm',
    target: 'es2022',
  });
}
