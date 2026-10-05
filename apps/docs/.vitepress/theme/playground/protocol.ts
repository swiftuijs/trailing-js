export interface CompileRequest {
  id: number;
  source: string;
  filename: string;
  jsxImportSource: string;
}
export interface CompileError {
  message: string;
  offset?: number;
  line?: number;
  column?: number;
}
export type CompileResponse = { id: number } & (
  | {
      result: {
        code: string;
        closures: number;
        guards: number;
        defers: number;
        switches: number;
        duration: number;
      };
      error?: never;
    }
  | { error: CompileError; result?: never }
);
