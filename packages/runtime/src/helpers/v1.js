/**
 * Compiler helper ABI v1. Synchronous cleanup uses native finally replacement
 * semantics: every reached cleanup runs, and the last cleanup failure wins.
 * Return values (including promises) are deliberately not awaited.
 * @param {Array<() => unknown> | undefined} stack
 * @returns {void}
 */
export function runDefers(stack) {
  let failed = false,
    failure;
  while (stack?.length) {
    const cleanup = stack.pop();
    if (cleanup) {
      try {
        cleanup();
      } catch (error) {
        failed = true;
        failure = error;
      }
    }
  }
  if (failed) throw failure;
}
