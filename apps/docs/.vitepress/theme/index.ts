import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import { defineAsyncComponent } from 'vue';
import './style.css';
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component(
      'TwillHome',
      defineAsyncComponent(() => import('./Home.vue')),
    );
    app.component(
      'TwillPlayground',
      defineAsyncComponent(() => import('./Playground.vue')),
    );
  },
} satisfies Theme;
