# 工具链

所有工作区使用 pnpm，构建使用 Vite 相关工具。

| 子包                 | 用途                                          |
| -------------------- | --------------------------------------------- |
| `packages/twill`     | 编译器、CLI、类型检查、构建插件、Node loader  |
| `packages/formatter` | 独立 Prettier 插件，保留 Twill 原始语法       |
| `packages/linter`    | 独立 ESLint 插件，映射错误位置和安全修复      |
| `editors/vscode`     | 高亮、类型提示、导航、重命名、格式化和调试    |
| `apps/docs`          | 本文档站点与在线 playground                   |
| `examples/*`         | 各自独立的普通代码、混用、React、Vue 和库示例 |

## 检查与构建

```sh
pnpm exec twill check -p tsconfig.json
pnpm exec twill doctor -p tsconfig.json --json
pnpm exec twill declarations -p tsconfig.json -o dist --build
```

JS 输出使用 Vite；声明命令生成标准 `.d.ts` 与映射。`--build` 先构建引用项目的声明。目前不是原生 `tsc --build` 的增量替代，不会生成 `.tsbuildinfo`。

## 格式化与 lint

安装 formatter、linter 产物和各自宿主工具，然后配置 Prettier 的 `plugins: ['@swiftuijs/twill-formatter']` 与 ESLint 的 `...twill.configs.recommended`。类型感知 lint 使用 `recommendedTypeChecked`。格式化保留尾闭包；无法精确映射回源码的修复不会提供。

VSIX 自带格式化器，使用编辑器缩进和 Prettier 默认值。要使用项目 Prettier 配置，可配合标准 Prettier 扩展。ESLint 扩展需验证 `twill-typescript` / `twill-tsx` 语言 ID。

[完整工具链参考](../tooling.md)涵盖具体配置、独立包命令、源码调试和库发布。是否适合生产采用，请结合[成熟度与限制](../readiness.md)和[性能数据](../performance.md)评估。
