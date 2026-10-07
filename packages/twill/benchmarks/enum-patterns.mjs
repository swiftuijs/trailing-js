import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { cpus, tmpdir, platform, arch } from 'node:os';
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { transform } from '../dist/index.js';
import { TwillProject } from '../dist/project.js';
import { TwillEditor } from '../dist/editor.js';
import { transform as minify } from 'esbuild';
process.chdir(fileURLToPath(new URL('../../../', import.meta.url)));
const iterations = 1_000_000,
  samples = 15,
  warmups = 5;
const input = [{ kind: 'idle' }, { kind: 'loaded', value: 3 }, { kind: 'loaded', value: 7 }];
const cases = [
  {
    name: 'direct-named-payload',
    input,
    sugar:
      'function run(input){return switch(input){case enum State.idle():0;case enum State.loaded({value}):value;};}',
    native:
      'function run(input){const subject=input;switch(subject.kind){case "idle":return 0;case "loaded":{const {value}=subject;return value;}}throw new TypeError("Non-exhaustive switch expression");}',
  },
  {
    name: 'expression-named-payload',
    input,
    sugar:
      'function run(input){const result=switch(input){case enum State.idle():0;case enum State.loaded({value}):value;};return result*2;}',
    native:
      'function run(input){let result;switch(input.kind){case "idle":result=0;break;case "loaded":{const {value}=input;result=value;break;}default:throw new TypeError("Non-exhaustive switch expression");}return result*2;}',
  },
  {
    name: 'native-object-rest',
    input,
    sugar:
      'function run(input){return switch(input){case enum State.idle():0;case enum State.loaded({value,...rest}):rest.kind.length+value;};}',
    native:
      'function run(input){const subject=input;switch(subject.kind){case "idle":return 0;case "loaded":{const {value,...rest}=subject;return rest.kind.length+value;}}throw new TypeError("Non-exhaustive switch expression");}',
  },
];
function measure(task) {
  for (let i = 0; i < warmups; i++) task();
  const times = [];
  let checksum;
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    checksum = task();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { medianMs: times[7], p95Ms: times[14], checksum };
}
function runtime(code, inputs) {
  const fn = Function(code + ';return run;')();
  return measure(() => {
    let total = 0;
    for (let i = 0; i < iterations; i++) total += fn(inputs[i % inputs.length]);
    return total;
  });
}
const worker = process.argv.indexOf('--worker');
if (worker >= 0) {
  const item = cases[Number(process.argv[worker + 1])];
  console.log(
    JSON.stringify(
      runtime(
        process.argv[worker + 2] === 'dialect'
          ? transform(item.sugar, { language: 'js' }).code
          : item.native,
        item.input,
      ),
    ),
  );
  process.exit(0);
}
const results = [];
for (const [index, item] of cases.entries()) {
  const generated = transform(item.sugar, { language: 'js' }).code;
  const fn = Function(generated + ';return run;')(),
    nativeFn = Function(item.native + ';return run;')();
  for (const value of item.input) assert.deepEqual(fn(value), nativeFn(value));
  const compiled = await minify(generated, { minify: true }),
    nativeCompiled = await minify(item.native, { minify: true });
  const isolated = (variant) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [fileURLToPath(import.meta.url), '--worker', String(index), variant],
        { encoding: 'utf8' },
      ),
    );
  const dialect = isolated('dialect'),
    native = isolated('native');
  assert.equal(dialect.checksum, native.checksum);
  results.push({
    name: item.name,
    bytes: Buffer.byteLength(compiled.code),
    gzipBytes: gzipSync(compiled.code).length,
    nativeBytes: Buffer.byteLength(nativeCompiled.code),
    nativeGzipBytes: gzipSync(nativeCompiled.code).length,
    dialect,
    native,
    medianRatio: dialect.medianMs / native.medianMs,
    extraIIFE: item.name.startsWith('expression'),
    restAllocation: item.name === 'native-object-rest',
  });
}
const compilation = [];
const root = mkdtempSync(join(tmpdir(), 'twill-pattern-benchmark-'));
try {
  for (const count of [10, 100, 1000]) {
    const declaration =
      'declare const State:{idle():{kind:"idle"};loaded(value:number):{kind:"loaded";value:number}};type Outcome={kind:"idle"}|{kind:"loaded";value:number};\n';
    const sugar =
      declaration +
      Array.from({ length: count }, (_, i) =>
        cases[0].sugar.replace('function run(input)', `export function read${i}(input:Outcome)`),
      ).join('\n');
    const plain =
      declaration +
      Array.from({ length: count }, (_, i) =>
        cases[0].native.replace('function run(input)', `export function read${i}(input:Outcome)`),
      ).join('\n');
    const generated = transform(sugar, { filename: 'benchmark.twill' }).code;
    const checking = {};
    for (const [variant, source, extension] of [
      ['dialect', sugar, 'twill'],
      ['native', plain, 'ts'],
    ]) {
      const filename = join(root, 'main.' + extension),
        config = join(root, 'tsconfig.json');
      writeFileSync(filename, source);
      writeFileSync(
        config,
        JSON.stringify({
          compilerOptions: {
            strict: true,
            types: [],
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            skipLibCheck: true,
          },
          files: [filename],
        }),
      );
      const start = performance.now(),
        project = new TwillProject(config);
      try {
        assert.deepEqual(project.diagnostics(), []);
        checking[variant] = {
          coldProjectAndCheckMs: performance.now() - start,
          warmCheck: measure(() => project.diagnostics().length),
        };
        assert.equal(checking[variant].warmCheck.checksum, 0);
        if (variant === 'dialect') {
          const editor = new TwillEditor(project),
            position = sugar.indexOf('State.loaded');
          const renameStart = performance.now();
          assert.equal(editor.renameInfo(filename, position + 6).canRename, false);
          checking[variant].coldDescriptorRenameMs = performance.now() - renameStart;
          checking[variant].cachedDescriptorRename = measure(() =>
            Number(editor.renameInfo(filename, position + 6).canRename),
          );
          assert.equal(checking[variant].cachedDescriptorRename.checksum, 0);
        }
      } finally {
        project.dispose();
      }
    }
    compilation.push({
      functions: count,
      sourceBytes: Buffer.byteLength(sugar),
      generatedBytes: Buffer.byteLength(generated),
      transform: measure(() => transform(sugar, { filename: 'benchmark.twill' }).code.length),
      nativeUnchangedTransform: measure(
        () => transform(plain, { filename: 'benchmark.twill' }).code.length,
      ),
      checking,
    });
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
const digest = createHash('sha256');
for (const name of readdirSync('packages/twill/dist')
  .filter((name) => name.endsWith('.js'))
  .sort())
  digest.update(name + '\0' + readFileSync('packages/twill/dist/' + name));
const report = {
  timestamp: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
  workingTreeDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  buildDigest: digest.digest('hex'),
  benchmarkDigest: createHash('sha256')
    .update(readFileSync(fileURLToPath(import.meta.url)))
    .digest('hex'),
  environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
  methodology: {
    iterations,
    samples,
    warmups,
    runtime:
      'Isolated warmed V8 processes; native direct switch or local assignment, equivalent inputs/checksums. Unchecked JS transformation for runtime; erased descriptors are verified separately by checked TS bundle tests.',
    checking:
      'One cold project/check and warmed unchanged diagnostics, standard libs included, filesystem fixture creation excluded. Synthetic functions share two native union variants.',
    scope:
      'No application, editor latency or cross-engine guarantees. IIFE and native rest allocation are reported explicitly. Timing ratios are observations, not CI gates.',
  },
  results,
  compilation,
};
const output = process.argv.indexOf('--output');
if (output >= 0) writeFileSync(process.argv[output + 1], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
