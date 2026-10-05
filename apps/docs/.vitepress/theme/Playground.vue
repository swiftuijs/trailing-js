<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
const snippets = {
  callbacks: {
    filename: 'example.twill',
    jsxImportSource: 'react',
    source: 'const doubled = [1, 2, 3].map { value in value * 2 };',
  },
  cleanup: {
    filename: 'example.twill',
    jsxImportSource: 'react',
    source: `export function useResource(resource: { close(): void }, name?: string) {
  defer { resource.close(); }
  guard const value = name else { throw new Error('Missing name'); }
  return value.toUpperCase();
}`,
  },
  react: {
    filename: 'example.twillx',
    jsxImportSource: 'react',
    source: `import { useState } from 'react';
function Panel(props: { children?: import('react').ReactNode }) {
  return <section>{props.children}</section>;
}
export default function App() {
  const [count, setCount] = useState(0);
  return Panel {
    <button onClick={() => setCount(count + 1)}>Count: {count}</button>;
  };
}`,
  },
  vue: {
    filename: 'example.twillx',
    jsxImportSource: 'vue',
    source: `import { defineComponent, ref } from 'vue';
declare const Panel: any;
export default defineComponent({ setup() {
  const count = ref(0);
  return () => Panel {
    <button onClick={() => count.value++}>Count: {count.value}</button>;
  };
} });`,
  },
};
const selected = ref<keyof typeof snippets>('callbacks');
const source = ref(snippets.callbacks.source);
const output = ref('Compile to see the generated TypeScript.');
const status = ref('Ready');
const busy = ref(false);
const failed = ref(false);
let worker: Worker | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
function stop() {
  worker?.terminate();
  worker = undefined;
  clearTimeout(timer);
  busy.value = false;
}
function compile() {
  stop();
  busy.value = true;
  failed.value = false;
  status.value = 'Compiling…';
  worker = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });
  const fail = (message: string) => {
    output.value = message;
    status.value = 'Compilation failed';
    failed.value = true;
    stop();
  };
  worker.onerror = (event) => fail(event.message || 'The compiler worker could not load.');
  worker.onmessage = ({ data }) => {
    if (data.error) {
      fail(data.error);
      return;
    }
    output.value = data.code;
    status.value = `Compiled · ${data.closures} closure(s), ${data.guards} guard(s), ${data.defers} defer(s)`;
    stop();
  };
  timer = setTimeout(
    () => fail('Compilation timed out. Reduce the source size and try again.'),
    3000,
  );
  worker.postMessage({ ...snippets[selected.value], source: source.value });
}
function choose() {
  stop();
  source.value = snippets[selected.value].source;
  output.value = 'Compile to see the generated TypeScript.';
  status.value = 'Ready';
  failed.value = false;
}
function keyboard(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    compile();
  }
}
onBeforeUnmount(stop);
</script>

<template>
  <div class="twill-playground" @keydown="keyboard">
    <div class="playground-toolbar">
      <label for="twill-example">Example</label>
      <select id="twill-example" v-model="selected" @change="choose">
        <option value="callbacks">Ordinary callbacks</option>
        <option value="cleanup">Guard and defer</option>
        <option value="react">React component</option>
        <option value="vue">Vue lazy slot</option>
      </select>
      <button type="button" :disabled="busy" @click="compile">
        {{ busy ? 'Compiling…' : 'Compile' }}
      </button>
    </div>
    <div class="playground-editors">
      <div>
        <label for="twill-source">Twill source · {{ snippets[selected].filename }}</label>
        <textarea
          id="twill-source"
          v-model="source"
          maxlength="20000"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
        />
      </div>
      <div>
        <label for="twill-output">Generated TypeScript / TSX</label>
        <textarea
          id="twill-output"
          :value="output"
          readonly
          spellcheck="false"
          :aria-invalid="failed"
        />
      </div>
    </div>
    <p class="playground-status" role="status" aria-live="polite">{{ status }}</p>
    <p class="playground-note">
      Ctrl / Cmd + Enter compiles. Everything stays in your browser. This view shows syntax
      lowering; it does not execute code or perform project type checking.
    </p>
  </div>
</template>
