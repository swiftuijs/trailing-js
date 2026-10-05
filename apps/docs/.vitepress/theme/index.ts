import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import Playground from './Playground.vue';
import './style.css';
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('TwillPlayground', Playground);
  },
} satisfies Theme;
