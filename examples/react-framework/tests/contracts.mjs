import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { rewrite } from '../scripts/rewrite.mjs';
import { transform } from '@swiftuijs/twill';
import { format } from '@swiftuijs/twill-formatter';
import { parse } from '@babel/parser';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(root, 'sources.json'), 'utf8'));
function normalized(source) {
  return JSON.parse(
    JSON.stringify(parse(source, { sourceType: 'module' }), (key, value) =>
      [
        'start',
        'end',
        'loc',
        'extra',
        'comments',
        'leadingComments',
        'trailingComments',
        'innerComments',
      ].includes(key)
        ? undefined
        : value,
    ),
  );
}
for (const file of manifest.files) {
  const source = readFileSync(resolve(root, 'upstream', file.path));
  assert.equal(createHash('sha256').update(source).digest('hex'), file.sha256, file.path);
  const filename = file.path.replace(/\.js$/, '.twill');
  const sourceText = readFileSync(resolve(root, 'src', filename), 'utf8');
  const before = transform(sourceText, { filename });
  const formatted = await format(sourceText, { filepath: filename });
  assert.equal(
    await format(formatted, { filepath: filename }),
    formatted,
    `Formatter idempotence: ${filename}`,
  );
  assert.deepEqual(
    normalized(transform(formatted, { filename }).code),
    normalized(before.code),
    `Formatter semantics: ${filename}`,
  );
}
// Exercise transformations independently of which forms this upstream uses.
for (const source of [
  'const value = items.map(value => ({ value }));',
  'const value = run(() => 1);',
  'const value = items.map(value => nested.map(item => item + value));',
  'function run(value) { if (!value) { throw new Error("missing"); } return value; }',
])
  assert.doesNotThrow(() => transform(rewrite(source).code));
assert.equal(rewrite('items.map(function(value) { return this.value + value; });').closures, 0);

function summary(react) {
  const element = react.createElement('button', { key: 'a:b', title: 'hello' }, 'ok');
  const clone = react.cloneElement(element, { title: 'changed' }, 'next');
  const children = [
    null,
    false,
    0,
    'text',
    element,
    [react.createElement('span', { key: 'nested' })],
  ];
  const context = react.createContext('initial');
  const component = () => null;
  const memo = react.memo(component);
  const forward = react.forwardRef((props, ref) => ref?.current ?? props.children);
  const ref = react.createRef();
  ref.current = 'owned';
  const result = {
    exports: Object.keys(react).sort(),
    version: react.version,
    element: [Symbol.keyFor(element.$$typeof), element.type, element.key, element.props],
    clone: [clone.type, clone.key, clone.props],
    children: react.Children.toArray(children).map((child) =>
      react.isValidElement(child) ? [child.type, child.key, child.props] : child,
    ),
    count: react.Children.count(children),
    mapped: react.Children.map([1, 2, 3], (value, index) => value + index),
    iterator: react.Children.toArray(new Set(['a', 'b'])),
    memo: [Symbol.keyFor(memo.$$typeof), memo.type === component, memo.compare],
    forward: [Symbol.keyFor(forward.$$typeof), typeof forward.render],
    context: [
      context._currentValue,
      context.Provider === context,
      Symbol.keyFor(context.Consumer.$$typeof),
    ],
    ref: ref.current,
  };
  const errors = [];
  for (const operation of [
    () => react.Children.only(null),
    () => react.Children.only([element]),
    () => react.Children.toArray({ value: 1 }),
    () => react.cloneElement(null),
  ]) {
    try {
      operation();
      assert.fail('Expected React validation error');
    } catch (error) {
      errors.push(error.message);
    }
  }
  result.errors = errors;
  assert.equal(react.Children.only(element), element);
  return result;
}
async function lifecycle(react, development) {
  const internal = react.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const previous = internal.H;
  const calls = [];
  internal.H = {
    useState: (value) => {
      calls.push(['state', value]);
      return [value, () => {}];
    },
    useMemo: (callback) => callback(),
    use: (value) => value,
  };
  assert.equal(react.useState(42)[0], 42);
  assert.equal(
    react.useMemo(() => 7, []),
    7,
  );
  assert.equal(react.use('resolved'), 'resolved');
  internal.H = previous;
  const transition = internal.T;
  react.startTransition(() => {
    assert.notEqual(internal.T, transition);
    calls.push(['transition']);
  });
  assert.equal(internal.T, transition);
  const value = () => null;
  const lazy = react.lazy(() => ({
    then(resolve) {
      resolve({ default: value });
    },
  }));
  assert.equal(lazy._init(lazy._payload), value);
  const error = new Error('lazy failed');
  const rejected = react.lazy(() => ({
    then(_resolve, reject) {
      reject(error);
    },
  }));
  assert.throws(
    () => rejected._init(rejected._payload),
    (thrown) => thrown === error,
  );
  let fulfill;
  const pending = {
    then(resolve) {
      fulfill = resolve;
    },
  };
  const suspended = react.lazy(() => pending);
  assert.throws(
    () => suspended._init(suspended._payload),
    (thrown) => thrown === pending,
  );
  fulfill({ default: value });
  assert.equal(suspended._init(suspended._payload), value);
  if (development) {
    await react.act(async () => {
      internal.actQueue.push(() => {
        calls.push(['act']);
        return null;
      });
    });
    assert.equal(internal.actQueue, null);
  }
  return calls;
}
for (const development of [true, false]) {
  const load = async (variant) =>
    import(
      pathToFileURL(
        resolve(
          root,
          `dist/${variant}-${development ? 'development' : 'production'}/index.${development ? 'cjs' : 'js'}`,
        ),
      ).href
    );
  const native = await load('native');
  const dialect = await load('twill');
  assert.deepEqual(summary(dialect), summary(native));
  assert.deepEqual(await lifecycle(dialect, development), await lifecycle(native, development));
  const nativePath = resolve(
    root,
    `dist/native-${development ? 'development' : 'production'}/index.${development ? 'cjs' : 'js'}`,
  );
  const dialectPath = resolve(
    root,
    `dist/twill-${development ? 'development' : 'production'}/index.${development ? 'cjs' : 'js'}`,
  );
  // Exact budget against the same upstream source, flags, target and minifier.
  assert(
    statSync(dialectPath).size <= statSync(nativePath).size + 512,
    'React output grew beyond 512 bytes',
  );
  assert(
    gzipSync(readFileSync(dialectPath)).length <= gzipSync(readFileSync(nativePath)).length + 256,
    'React gzip output grew beyond 256 bytes',
  );
}
console.log(
  `React framework contracts passed: ${manifest.files.length} upstream modules; dev/prod APIs, children, errors, dispatcher hooks, transitions, lazy/suspense and act.`,
);
