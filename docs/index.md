---
layout: home
hero:
  name: Twill
  text: TypeScript, with a different rhythm.
  tagline: Trailing closures, guard and defer. Compile to ordinary TypeScript and JavaScript; keep your frameworks, tools and engines.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: Try the playground
      link: /playground
features:
  - title: Ordinary code, too
    details: Write data processing, async workflows and resource cleanup. Components are one use case.
  - title: Keep the ecosystem
    details: Mix .twill and .twillx with native TS/JS. Use Vite, Node and ordinary framework semantics.
  - title: A complete working loop
    details: Type checking, VS Code assistance, Prettier, ESLint, source maps and native library declarations.
---

## A callback without the punctuation pile-up

```twill
const doubled = [1, 2, 3].map { value in
  value * 2;
};
```

Twill adds syntax, not a new JavaScript engine. Ordinary closures and guards lower to ordinary arrows and branches. Cleanup and complex child collection do allocate; see [measured performance](./performance.md).

The 0.x language is **experimental**. Read the [supported contract and remaining limits](./readiness.md) before adopting it. Packages are currently distributed as reviewed tarballs and VSIX artifacts; public registry publication is separate.
