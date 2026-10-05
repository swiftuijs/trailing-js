<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { CodeEditor } from './editor';
const props = defineProps<{
  modelValue: string;
  label: string;
  readOnly?: boolean;
  jsx: boolean;
  error?: { message: string; offset?: number } | null;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; limit: [] }>();
const host = ref<HTMLElement>();
const ready = ref(false);
const fallback = ref<HTMLTextAreaElement>();
let disposed = false;
let editor: CodeEditor | undefined;
onMounted(async () => {
  try {
    // Load editor packages only on this route. Other guides keep a small bundle.
    const { createEditor } = await import('./editor');
    if (disposed) return;
    editor = createEditor(host.value!, {
      value: props.modelValue,
      label: props.label,
      readOnly: !!props.readOnly,
      jsx: props.jsx,
      change: (value) => emit('update:modelValue', value),
      limit: () => emit('limit'),
    });
    if (!props.readOnly) editor.setError(props.error ?? null);
    ready.value = true;
  } catch {
    // Retain a usable textarea if the editor's lazy chunk cannot load.
  }
});
watch(
  () => props.modelValue,
  (value) => editor?.setDocument(value),
);
watch(
  () => props.jsx,
  (value) => editor?.setJSX(value),
);
watch(
  () => props.error,
  (error) => {
    if (!props.readOnly) editor?.setError(error ?? null);
  },
);
onBeforeUnmount(() => {
  disposed = true;
  editor?.destroy();
});
defineExpose({
  focus(offset = 0) {
    if (editor) editor.focus(offset);
    else {
      fallback.value?.focus();
      fallback.value?.setSelectionRange(offset, offset);
    }
  },
});
</script>
<template>
  <div class="playground-code-editor">
    <div ref="host" />
    <textarea
      v-if="!ready"
      ref="fallback"
      class="playground-editor-fallback"
      aria-describedby="playground-editor-help"
      :aria-label="label"
      :readonly="readOnly"
      :value="modelValue"
      maxlength="20000"
      spellcheck="false"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
  </div>
</template>
