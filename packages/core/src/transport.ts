import type { FillEvent, FillRequest } from "./protocol";
import { parseFillEvents } from "./protocol";

export type FillTransport = (
  req: FillRequest,
  signal?: AbortSignal,
) => AsyncIterable<FillEvent>;

function wasAborted(error: unknown, signal?: AbortSignal): boolean {
  return (
    signal?.aborted === true ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function transportError(message: string, retryable: boolean): FillEvent {
  return { type: "error", fillId: "", message, retryable };
}

export function createFetchTransport(
  endpoint: string,
  init: {
    headers?: Record<string, string>;
    fetch?: typeof fetch;
  } = {},
): FillTransport {
  const fetchImplementation = init.fetch ?? globalThis.fetch;

  return async function* fetchTransport(req, signal) {
    if (signal?.aborted) {
      return;
    }

    try {
      const response = await fetchImplementation(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
          ...init.headers,
        },
        body: JSON.stringify(req),
        signal,
      });

      if (signal?.aborted) {
        return;
      }

      if (!response.ok) {
        const message = (await response.text()).slice(0, 500);
        if (!signal?.aborted) {
          yield transportError(
            message,
            response.status === 429 ||
              (response.status >= 500 && response.status <= 599),
          );
        }
        return;
      }

      if (!response.body) {
        yield transportError("Response body is missing", true);
        return;
      }

      for await (const event of parseFillEvents(response.body)) {
        if (signal?.aborted) {
          return;
        }
        yield event;
      }
    } catch (error) {
      if (wasAborted(error, signal)) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      yield transportError(message.slice(0, 500), true);
    }
  };
}
