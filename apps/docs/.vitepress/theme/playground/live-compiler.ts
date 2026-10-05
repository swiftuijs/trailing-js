import type { CompileRequest, CompileResponse, CompileError } from './protocol';
export type CompilationState =
  | { phase: 'pending' }
  | { phase: 'compiling' }
  | { phase: 'ready'; result: NonNullable<CompileResponse['result']> }
  | { phase: 'error'; error: CompileError };

/** Reuse the worker, coalesce edits, and publish only the newest source result. */
export class LiveCompiler {
  private worker?: Worker;
  private revision = 0;
  private active?: CompileRequest;
  private pending?: CompileRequest;
  private debounce?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setTimeout>;
  private disposed = false;
  constructor(
    private createWorker: () => Worker,
    private publish: (state: CompilationState) => void,
  ) {}
  update(input: Omit<CompileRequest, 'id'>, immediate = false) {
    if (this.disposed) return;
    const request = { ...input, id: ++this.revision };
    clearTimeout(this.debounce);
    this.pending = undefined;
    this.publish({ phase: 'pending' });
    const enqueue = () => {
      this.pending = request;
      this.drain();
    };
    if (immediate) enqueue();
    else this.debounce = setTimeout(enqueue, 180);
  }
  private drain() {
    if (this.disposed || this.active || !this.pending) return;
    const request = this.pending;
    this.pending = undefined;
    this.active = request;
    this.publish({ phase: 'compiling' });
    try {
      if (!this.worker) {
        const worker = this.createWorker();
        this.worker = worker;
        worker.onmessage = ({ data }: MessageEvent<CompileResponse>) => {
          if (worker !== this.worker || data.id !== this.active?.id) return;
          clearTimeout(this.watchdog);
          this.active = undefined;
          if (data.id === this.revision) {
            if (data.error) this.publish({ phase: 'error', error: data.error });
            else this.publish({ phase: 'ready', result: data.result });
          }
          this.drain();
        };
        worker.onerror = (event) => {
          if (worker !== this.worker) return;
          event.preventDefault();
          this.fail(
            event.message || 'The compiler could not load. Check your connection and retry.',
          );
        };
      }
      // Bound the active job, rather than resetting its deadline on every edit.
      this.watchdog = setTimeout(
        () => this.fail('Compilation timed out. Reduce the source size and retry.'),
        5000,
      );
      this.worker.postMessage(request);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    }
  }
  private fail(message: string) {
    const id = this.active?.id;
    clearTimeout(this.watchdog);
    this.worker?.terminate();
    this.worker = undefined;
    this.active = undefined;
    if (id === this.revision) this.publish({ phase: 'error', error: { message } });
    this.drain();
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.debounce);
    clearTimeout(this.watchdog);
    this.worker?.terminate();
    this.worker = undefined;
    this.pending = undefined;
    this.active = undefined;
  }
}
