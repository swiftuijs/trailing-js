# 开始使用

使用 `.twill` 写 TS（也包含普通 JS 语法），使用 `.twillx` 写 TSX。原生 `.ts`、`.tsx`、`.js`、`.jsx` 文件继续使用各自的语法。

## 安装

目前尚未发布 npm 或 Marketplace 包。可使用[成功 CI 的构建产物](https://github.com/swiftuijs/twill/actions)，也可以从源码构建。仓库开发要求 Node 22.13+ 或 Node 24+，pnpm 版本由根目录 `packageManager` 固定。

```sh
git clone https://github.com/swiftuijs/twill.git
cd twill
pnpm install --frozen-lockfile
pnpm build
pnpm package:core
pnpm package:tooling
pnpm editor:package
```

将生成的 `.tgz` 安装到你的应用；在 VS Code 使用“从 VSIX 安装”安装 `dist/twill.vsix`。

```sh
pnpm add -D /path/to/swiftuijs-twill-0.8.0.tgz
```

## 与 TS / JS 混用

`src/numbers.twill`：

```twill
export const doubled = [1, 2, 3].map { value in
  value * 2;
};
```

`src/main.ts`：

```ts
import { doubled } from './numbers.twill';
console.log(doubled);
```

在 Vite 配置里注册插件：

```ts
import { defineConfig } from 'vite';
import twill from '@swiftuijs/twill/vite';
export default defineConfig({ plugins: [twill()] });
```

用 `pnpm exec twill check -p tsconfig.json` 检查项目。原生 `tsc` 无法直接读取 Twill 语法；发布库时可以生成标准 `.d.ts`，让普通 TS 消费者直接使用。

React 开发热更新请参考[框架集成](../frameworks.md)。完整的 Node、格式化、lint 和声明构建配置见[工具链](./tooling.md)。
