export type ModelStreamEvent =
  | { type: "item"; item: unknown }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "error"; error: unknown; retryable: boolean };

export interface ModelAdapter {
  streamItems(input: {
    system: string;
    prompt: string;
    signal?: AbortSignal;
  }): AsyncIterable<ModelStreamEvent>;
}
