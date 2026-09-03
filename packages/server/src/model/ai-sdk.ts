import { type JSONValue, type LanguageModel, streamObject } from "ai";

import { FillItemSchema } from "../schema";
import type { ModelAdapter } from "./adapter";

function errorStatus(error: unknown): number | undefined {
  if (error === null || typeof error !== "object") {
    return undefined;
  }
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  for (const value of [
    candidate.status,
    candidate.statusCode,
    candidate.response?.status,
  ]) {
    if (typeof value === "number") {
      return value;
    }
  }
  return undefined;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function isRetryable(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted || isAbortError(error)) {
    return false;
  }
  const status = errorStatus(error);
  if (status !== undefined) {
    return status === 429 || status >= 500;
  }
  if (error instanceof TypeError) {
    return true;
  }
  if (error !== null && typeof error === "object") {
    if (
      "isRetryable" in error &&
      typeof (error as { isRetryable: unknown }).isRetryable === "boolean"
    ) {
      return (error as { isRetryable: boolean }).isRetryable;
    }
    if (
      "code" in error &&
      /^(?:ECONN|EAI_AGAIN|ENET|ETIMEDOUT)/.test(
        String((error as { code: unknown }).code),
      )
    ) {
      return true;
    }
  }
  return (
    error instanceof Error &&
    /(?:network|fetch failed|socket|timed? out|connection)/i.test(error.message)
  );
}

export function createAISDKAdapter(
  model: LanguageModel,
  opts: {
    providerOptions?: Record<string, Record<string, JSONValue>>;
    temperature?: number;
  } = {},
): ModelAdapter {
  return {
    async *streamItems(input) {
      try {
        const result = streamObject({
          model,
          output: "array",
          schema: FillItemSchema,
          system: input.system,
          prompt: input.prompt,
          abortSignal: input.signal,
          providerOptions: opts.providerOptions,
          temperature: opts.temperature,
        });

        for await (const item of result.elementStream) {
          yield { type: "item" as const, item };
        }

        const usage = await result.usage;
        yield {
          type: "usage" as const,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
        };
      } catch (error) {
        yield {
          type: "error" as const,
          error,
          retryable: isRetryable(error, input.signal),
        };
      }
    },
  };
}
