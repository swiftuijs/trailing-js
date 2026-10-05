---
outline: false
---

# Playground

Edit a module, then compile it with the same syntax transformer used by the toolchain. Source stays in your browser. Choose a React or Vue example to see ordinary JSX or lazy slot output.

<TwillPlayground />

The output is **TS/TSX**, before type erasure and the host JSX transform. Use the project checker for types and a build adapter for runnable JavaScript. The worker limits source size and compilation time so malformed input cannot keep the page's UI busy indefinitely.
