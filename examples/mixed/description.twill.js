/** @param {string} state */
export function describe(state) {
  /** @param {() => string} callback */
  const run = callback => callback();
  return run() { `status: ${state}` };
}
