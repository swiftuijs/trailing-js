---
layout: home
hero:
  name: Twill
  text: 给 TypeScript 换一种书写节奏。
  tagline: 尾闭包、guard 与 defer。编译后继续使用现有的 JavaScript 引擎、框架和工具。
  actions:
    - theme: brand
      text: 开始使用
      link: /zh/getting-started
    - theme: alt
      text: 在线试用
      link: /playground
features:
  - title: 普通开发同样适用
    details: 数据处理、异步流程和资源清理都可以使用；组件只是其中一种场景。
  - title: 保留现有生态
    details: 与原生 TS/JS 双向混用，使用 Vite、Node、React 或 Vue 的原有语义。
  - title: 可实际工作的工具链
    details: 类型检查、VS Code 提示、格式化、lint、源码映射和标准声明文件。
---

## 尾闭包

```twill
const doubled = [1, 2, 3].map { value in
  value * 2;
};
```

Twill 是语法糖语言，使用现有 TypeScript 类型系统与 JavaScript 引擎。0.x 阶段仍是实验性的；采用前请阅读[支持范围和成熟度](../readiness.md)。
