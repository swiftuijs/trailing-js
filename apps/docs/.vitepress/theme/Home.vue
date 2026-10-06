<script setup lang="ts">
import { ref } from 'vue';
import { withBase } from 'vitepress';
import './home.css';

const examples = [
  {
    id: 'validation',
    label: 'Validation',
    title: 'Keep the successful path in view.',
    detail:
      'An explicit exit narrows the value for the rest of the scope. Nullish checks keep zero and false.',
    link: '/why-twill#keep-the-successful-path-in-view',
  },
  {
    id: 'cleanup',
    label: 'Cleanup',
    title: 'Keep release beside acquisition.',
    detail:
      'Reached cleanups run when the block exits, including return and throw. Cleanup callbacks allocate; native try/finally remains available.',
    link: '/why-twill#put-cleanup-next-to-acquisition',
  },
  {
    id: 'states',
    label: 'Business states',
    title: 'Make missing cases visible.',
    detail:
      'Match an ordinary TS union and bind its payload. Run twill check to prove exhaustiveness; the playground and bundler do not check types.',
    link: '/why-twill#make-business-state-changes-reviewable',
  },
  {
    id: 'callbacks',
    label: 'Callbacks',
    title: 'Put the callback where you read it.',
    detail:
      'A single expression returns its value. Types come from the existing API; the output is an ordinary arrow callback.',
    link: '/why-twill#keep-ordinary-callbacks-and-components-readable',
  },
];
const selected = ref('validation');
function navigateTabs(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const index = examples.findIndex((example) => example.id === selected.value);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? examples.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + examples.length) % examples.length;
  selected.value = examples[next]!.id;
  (event.currentTarget as HTMLElement)
    .querySelector<HTMLButtonElement>(`#tab-${selected.value}`)
    ?.focus();
}
</script>

<template>
  <div class="twill-home">
    <header class="home-hero home-container">
      <div class="hero-copy">
        <h1>Clearer flow.<span>Same TypeScript.</span></h1>
        <p class="hero-description">
          Make validation, cleanup and business states explicit. Twill adds a small layer of syntax
          that compiles to ordinary JavaScript.
        </p>
        <div class="home-actions">
          <a class="home-button primary" :href="withBase('/playground')">Try the playground</a>
          <a class="home-button secondary" :href="withBase('/getting-started')">Get started</a>
        </div>
        <p class="hero-status">JS / TS compatible · No language runtime · Experimental 0.1</p>
      </div>
      <figure class="hero-example">
        <div class="home-code-frame">
          <div class="home-code-heading">
            <span>workflow.twill</span><span class="code-format">.twill → TypeScript</span>
          </div>
          <slot name="hero" />
        </div>
        <figcaption>Validate early. Release on every exit.</figcaption>
      </figure>
    </header>

    <section class="home-benefits home-container" aria-label="Built on the ecosystem">
      <div>
        <h2>No language runtime</h2>
        <p>Native arrows, branches and framework APIs.</p>
      </div>
      <div>
        <h2>Your TypeScript types</h2>
        <p>Inference, narrowing and checked union cases.</p>
      </div>
      <div>
        <h2>One file at a time</h2>
        <p>Keep TS/JS imports and your existing build.</p>
      </div>
    </section>

    <section class="home-comparison home-container" aria-labelledby="comparison-heading">
      <h2 id="comparison-heading">See what changes.</h2>
      <p class="section-description">Small changes to the code you read every day.</p>
      <div class="home-tabs" role="tablist" aria-label="Code comparison" @keydown="navigateTabs">
        <button
          v-for="example in examples"
          :id="`tab-${example.id}`"
          :key="example.id"
          role="tab"
          :aria-selected="selected === example.id"
          :aria-controls="`panel-${example.id}`"
          :tabindex="selected === example.id ? 0 : -1"
          @click="selected = example.id"
        >
          {{ example.label }}
        </button>
      </div>
      <div
        v-for="example in examples"
        v-show="selected === example.id"
        :id="`panel-${example.id}`"
        :key="example.id"
        role="tabpanel"
        :aria-labelledby="`tab-${example.id}`"
        tabindex="0"
      >
        <div class="home-code-frame comparison-code">
          <div class="comparison-column">
            <h3 class="home-code-heading">TypeScript</h3>
            <slot :name="`${example.id}-ts`" />
          </div>
          <div class="comparison-column">
            <h3 class="home-code-heading">Twill</h3>
            <slot :name="`${example.id}-twill`" />
          </div>
        </div>
        <div class="comparison-explanation">
          <h3>{{ example.title }}</h3>
          <p>{{ example.detail }}</p>
          <a class="home-link" :href="withBase(example.link)">
            Read the semantics and tradeoffs
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
          </a>
        </div>
      </div>
    </section>

    <section class="home-toolchain home-container" aria-labelledby="toolchain-heading">
      <div>
        <h2 id="toolchain-heading">A language is only useful<br />with its tools.</h2>
        <p class="section-description">Write, check, format and debug in one working loop.</p>
      </div>
      <div>
        <dl class="toolchain-rows">
          <div>
            <dt>Editor</dt>
            <dd>Completion, diagnostics, rename and source debugging.</dd>
          </div>
          <div>
            <dt>Quality</dt>
            <dd>TypeScript checking, Prettier and ESLint.</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>Vite, Node ESM, source maps and native declarations.</dd>
          </div>
        </dl>
        <a class="home-link" :href="withBase('/tooling')">
          Explore the toolchain
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
        </a>
      </div>
    </section>

    <section class="home-adoption" aria-labelledby="adoption-heading">
      <div class="home-container adoption-content">
        <div>
          <h2 id="adoption-heading">Start small.<br />Keep your options open.</h2>
          <p class="section-description">
            Use Twill where clearer control flow earns its place. Keep the rest of your project in
            TypeScript.
          </p>
          <ol class="adoption-steps">
            <li>
              <a :href="withBase('/patterns')"><span>01</span>Try a workflow</a>
            </li>
            <li>
              <a :href="withBase('/getting-started')"><span>02</span>Add one module</a>
            </li>
            <li>
              <a :href="withBase('/adoption#keep-the-development-loop-complete')"
                ><span>03</span>Check it in CI</a
              >
            </li>
          </ol>
          <div class="home-actions">
            <a class="home-button primary" :href="withBase('/playground')">Try the playground</a>
            <a class="home-link" :href="withBase('/why-twill')">
              Read why Twill
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
            </a>
          </div>
        </div>
        <aside class="adoption-status" aria-labelledby="status-heading">
          <h3 id="status-heading">Built for evaluation.</h3>
          <p>
            Twill 0.1 is experimental. The supported workflow is tested, but broad production
            readiness still needs real project pilots and stable releases.
          </p>
          <a class="home-link" :href="withBase('/readiness')">Compatibility &amp; limitations</a>
          <a class="home-link" :href="withBase('/adoption#export-back-to-native-ts')"
            >Export to native TS</a
          >
        </aside>
      </div>
    </section>
  </div>
</template>
