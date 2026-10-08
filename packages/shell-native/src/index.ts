/** Internal Rust process boundary. Applications import @swiftuijs/twill-shell. */
export { loadBackend, shutdownBackend } from './bindings.js';
export type { NativeBindings, NativeFailure, NativeOutcome, NativeOptions } from './bindings.js';
