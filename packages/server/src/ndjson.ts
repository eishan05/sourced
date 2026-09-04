import { encodeFillEvent, type FillEvent } from "@sourced/core";

interface RaceResult {
  kind: "event" | "ping" | "abort";
  result?: IteratorResult<FillEvent>;
}

function raceNext(
  next: Promise<IteratorResult<FillEvent>>,
  pingMs: number,
  signal?: AbortSignal,
): Promise<RaceResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result: RaceResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = (): void => finish({ kind: "abort" });
    const timer = setTimeout(() => finish({ kind: "ping" }), pingMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    next.then(
      (result) => finish({ kind: "event", result }),
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

export function toNdjsonResponse(
  events: AsyncIterable<FillEvent>,
  opts: { pingMs?: number; signal?: AbortSignal } = {},
): Response {
  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  let closed = false;
  const closeIterator = async (): Promise<void> => {
    if (!closed) {
      closed = true;
      await iterator.return?.();
    }
  };

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let next = iterator.next();
      try {
        while (!closed) {
          if (opts.signal?.aborted) break;
          const raced = await raceNext(
            next,
            opts.pingMs ?? 15_000,
            opts.signal,
          );
          if (raced.kind === "abort") break;
          if (raced.kind === "ping") {
            controller.enqueue(
              encoder.encode(encodeFillEvent({ type: "ping" })),
            );
            continue;
          }
          const result = raced.result;
          if (!result) break;
          if (result.done) break;
          controller.enqueue(encoder.encode(encodeFillEvent(result.value)));
          if (result.value.type === "done" || result.value.type === "error") {
            break;
          }
          next = iterator.next();
        }
        if (!closed) controller.close();
      } catch (error) {
        if (!closed) controller.error(error);
      } finally {
        await closeIterator();
      }
    },
    async cancel() {
      await closeIterator();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
