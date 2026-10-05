/** Ordinary TypeScript types, consumable without Twill. */
export interface TextDocument {
  readText(): Promise<string>;
  close(): Promise<void>;
}

export interface Payment {
  readonly reference: string;
  readonly amountCents: number;
}

export interface LedgerSummary {
  readonly references: readonly string[];
  readonly totalCents: number;
}

export type LedgerOutcome =
  | { readonly kind: 'ok'; readonly value: LedgerSummary }
  | {
      readonly kind: 'invalid';
      readonly reason: 'json' | 'shape' | 'row' | 'overflow';
      readonly row?: number;
    };

export interface ImportOptions {
  readonly signal?: AbortSignal;
}
