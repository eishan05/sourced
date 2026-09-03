import { describe, expect, it, vi } from "vitest";

import type { FillEvent, FillRequest } from "./protocol";
import { encodeFillEvent } from "./protocol";
import { createFetchTransport } from "./transport";

const encoder = new TextEncoder();
const request: FillRequest = {
  form: {
    id: "test",
    title: "Test",
    version: 1,
    sections: [],
  },
  sources: [],
  mode: "fill",
  today: "2026-09-03",
};

function eventResponse(events: FillEvent[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(encodeFillEvent(event)));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

async function collect(
  iterable: AsyncIterable<FillEvent>,
): Promise<FillEvent[]> {
  const events: FillEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

describe("createFetchTransport", () => {
  it("posts JSON and yields streamed events in order", async () => {
    const expected: FillEvent[] = [
      { type: "start", fillId: "fill-1", targetFieldIds: [] },
      { type: "ping" },
      {
        type: "done",
        fillId: "fill-1",
        counts: { proposals: 0, questions: 0, flags: 0 },
      },
    ];
    const fetchMock = vi.fn<typeof fetch>(async () => eventResponse(expected));
    const transport = createFetchTransport("/fill", {
      fetch: fetchMock,
      headers: { Authorization: "Bearer token" },
    });

    expect(await collect(transport(request))).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/fill");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Accept: "application/x-ndjson",
        "Content-Type": "application/json",
        Authorization: "Bearer token",
      },
      body: JSON.stringify(request),
    });
  });

  it.each([
    [500, true],
    [400, false],
  ])("turns HTTP %s into a retryable=%s error", async (status, retryable) => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response("server response", { status }),
    );
    const [event] = await collect(
      createFetchTransport("/fill", { fetch: fetchMock })(request),
    );
    expect(event).toEqual({
      type: "error",
      fillId: "",
      message: "server response",
      retryable,
    });
  });

  it("reports a missing response body", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => ({ ok: true, status: 200, body: null }) as Response,
    );
    expect(
      await collect(
        createFetchTransport("/fill", { fetch: fetchMock })(request),
      ),
    ).toEqual([
      {
        type: "error",
        fillId: "",
        message: "Response body is missing",
        retryable: true,
      },
    ]);
  });

  it("ends iteration without throwing after abort", async () => {
    const expected: FillEvent[] = [{ type: "ping" }, { type: "ping" }];
    const fetchMock = vi.fn<typeof fetch>(async () => eventResponse(expected));
    const controller = new AbortController();
    const iterator = createFetchTransport("/fill", { fetch: fetchMock })(
      request,
      controller.signal,
    )[Symbol.asyncIterator]();

    expect(await iterator.next()).toEqual({
      value: { type: "ping" },
      done: false,
    });
    controller.abort();
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });
});
