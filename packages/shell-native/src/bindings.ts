import { createRequire } from 'node:module';
import type { Buffer } from 'node:buffer';
import { nativeTarget } from './platform.js';

export interface NativeFailure {
  kind: string;
  message: string;
  stream?: 'stdin' | 'stdout' | 'stderr';
  code?: string;
  osCode?: number;
}
export interface NativeOutcome {
  processIdentifier?: number;
  code?: number;
  signal?: number;
  windowsSignal?: NodeJS.Signals;
  standardOutput?: Buffer;
  standardError?: Buffer;
  failure?: NativeFailure;
  cleanupErrors: NativeFailure[];
  unresolvedProcessIdentifier?: number;
}
export interface NativeOptions {
  executable: string;
  arguments: readonly string[];
  cwd?: string;
  environment: NodeJS.ProcessEnv;
  input?: Buffer;
  inheritInput: boolean;
  outputLimit?: number;
  errorLimit?: number;
  discardOutput: boolean;
  discardError: boolean;
  timeoutMs?: number;
  gracePeriodMs: number;
  killTimeoutMs: number;
}
export interface NativeBindings {
  protocol(): number;
  start(options: NativeOptions): { id: number; promise: Promise<NativeOutcome> };
  cancel(id: number, setupFailure: boolean): void;
  shutdown(): void;
}

// Lazy loading keeps option validation/already-aborted calls free of native work.
// No implicit fallback, download, install hook or environment-selected binary.
let bindings: NativeBindings | undefined;
export function loadBackend(): NativeBindings {
  if (bindings) return bindings;
  const filename = `../native/${nativeTarget()}.node`;
  const candidate = createRequire(import.meta.url)(filename) as NativeBindings;
  if (candidate.protocol?.() !== 1)
    throw new Error('Incompatible native subprocess backend: expected protocol 1');
  bindings = candidate;
  process.once('exit', shutdownBackend);
  return bindings;
}

export function shutdownBackend() {
  bindings?.shutdown();
}
