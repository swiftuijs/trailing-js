# 语法

## 尾闭包

```twill
const doubled = [1, 2, 3].map { value in
  value * 2;
};
const strings = [1, 2].map { (value: number): string in
  String(value);
};
```

空括号可省略；已有参数保留在括号里，尾闭包成为最后的回调参数。只有一个表达式的闭包隐式返回；多语句闭包需要显式 `return`。后续闭包带标签，仍按位置传参，不依赖函数形参名。

## guard

```twill
function requireName(input: string | undefined) {
  guard const name = input else {
    throw new Error('缺少名称');
  }
  return name;
}
```

`guard const` 对 `null` / `undefined` 判断，保留 `0`、`false`、空字符串。失败分支必须能证明退出。绑定位于原来的词法作用域。

## defer

```twill
function useResource(resource: { close(): void }) {
  defer {
    resource.close();
  }
  return 42;
}
```

退出当前代码块时，按注册的逆序执行清理。只有运行到的注册才生效；异常不会阻止剩余清理执行。清理闭包有分配和栈管理开销，不适合作为高频热循环中原生 `finally` 的免费替代。

`guard` 和 `defer` 是上下文语法；同名变量、属性和普通函数调用仍可使用。

## 组件

在 `.twillx` 中，大写组件调用使用原生 JSX 语义。React children 与 Vue slot 遵循框架原有类型和行为，无须注册组件列表或二次包装。显式 `(Run) { ... }` 保留普通函数回调语义。

请阅读[完整语法契约](../syntax.md)，包括换行、括号、标签、作用域、异步清理和不支持的语法。Twill 不实现 Swift 的完整语言和类型系统。
