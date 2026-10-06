# Framework development

Twill lowers component syntax to ordinary framework code. It does not replace framework runtimes or wrap component libraries.

## React with Vite 8

Install Vite 8 and `@vitejs/plugin-react` 6 alongside the compiler. The optional React subpath composes the standard plugin with Twill compilation and includes `.twill` / `.twillx` in its Fast Refresh filters:

```ts
import { defineConfig } from 'vite';
import twillReact from '@swiftuijs/twill/vite-react';
export default defineConfig({ plugins: twillReact() });
```

```twillx
import { useState } from 'react';
function Panel(props: { children?: import('react').ReactNode }) {
  return <section>{props.children}</section>;
}
export default function App() {
  const [count, setCount] = useState(0);
  return Panel {
    <button onClick={() => setCount(count + 1)}>Count: {count}</button>;
  };
}
```

Editing component text preserves compatible hook state. Hook signature changes can remount the component, and modules mixing component exports with incompatible noncomponent exports can invalidate the boundary. These are the standard React Fast Refresh rules. Production builds include no refresh runtime. Source maps retain original Twill locations.

`TwillReactOptions` has `twill` and `react` fields for each plugin's standard options. The automatic JSX runtime is required. This adapter targets Vite 8 / React plugin 6; ordinary Twill build adapters do not require the optional React plugin. SSR frameworks still need their own integration and preamble handling, as with the standard Vite React plugin.

## Vue

Use `@swiftuijs/twill/vite` and the standard JSX runtime selection (`jsxImportSource: "vue"` in tsconfig, or the normal file pragma). Twill closures become lazy slots, including scoped/named slots; slot rendering owns reactive reads. Native Vue JSX declarations can require explicit slot parameter types.

The compiler does not process `.vue` SFC syntax. Add the standard Vue Vite plugin for SFC files. Vue-specific JSX HMR remains a host integration; the React adapter is not a Vue adapter.

## Third-party libraries

Import components directly. [SwiftUI.js](https://swiftuijs.evecalm.com/docs/) (`@swiftuijs/ui`) is Twill's sibling project, a SwiftUI-inspired React component library. It appears in the React example and uses ordinary component imports, props, React state and shared styles. Follow its [getting started guide](https://swiftuijs.evecalm.com/docs/getting-started/) for installation and styles; its [repository](https://github.com/swiftuijs/ui) contains the component sources.

Other libraries receive their normal JSX props/children/slot semantics. Follow each library's own SSR, styling and browser requirements.
