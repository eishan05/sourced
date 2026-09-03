import type { ModelAdapter } from "./adapter";

interface DelayStep {
  delayMs: number;
}

interface ErrorStep {
  error: unknown;
  retryable: boolean;
}

function isDelayStep(value: unknown): value is DelayStep {
  return (
    value !== null &&
    typeof value === "object" &&
    "delayMs" in value &&
    typeof (value as DelayStep).delayMs === "number"
  );
}

function isErrorStep(value: unknown): value is ErrorStep {
  return (
    value !== null &&
    typeof value === "object" &&
    "error" in value &&
    "retryable" in value &&
    typeof (value as ErrorStep).retryable === "boolean"
  );
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, Math.max(0, ms));
    signal?.addEventListener("abort", finish, { once: true });
  });
}

export function createFakeAdapter(
  script: Array<unknown | DelayStep | ErrorStep>,
  opts: { usage?: { inputTokens: number; outputTokens: number } } = {},
): ModelAdapter {
  return {
    async *streamItems(input) {
      for (const step of script) {
        if (input.signal?.aborted) {
          return;
        }
        if (isDelayStep(step)) {
          await delay(step.delayMs, input.signal);
          continue;
        }
        if (isErrorStep(step)) {
          yield { type: "error", error: step.error, retryable: step.retryable };
          return;
        }
        yield { type: "item", item: step };
      }
      if (!input.signal?.aborted) {
        yield {
          type: "usage",
          inputTokens: opts.usage?.inputTokens ?? 0,
          outputTokens: opts.usage?.outputTokens ?? 0,
        };
      }
    },
  };
}
