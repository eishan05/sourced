import { describe, expect, it } from "vitest";

import type { FillEvent } from "./protocol";
import { encodeFillEvent, isFillEvent, parseFillEvents } from "./protocol";

const encoder = new TextEncoder();

function streamFromStrings(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collect(
  stream: ReadableStream<Uint8Array>,
): Promise<FillEvent[]> {
  const events: FillEvent[] = [];
  for await (const event of parseFillEvents(stream)) {
    events.push(event);
  }
  return events;
}

const span = {
  sourceId: "source-1",
  start: 0,
  end: 5,
  quote: "Priya",
  match: "exact" as const,
};

const events: FillEvent[] = [
  { type: "start", fillId: "fill-1", targetFieldIds: ["name"] },
  {
    type: "proposal",
    proposal: {
      id: "proposal-1",
      fillId: "fill-1",
      fieldId: "name",
      kind: "extracted",
      value: "Priya",
      span,
      normalization: { raw: " priya ", explanation: "Trimmed whitespace" },
    },
  },
  {
    type: "question",
    question: {
      id: "question-1",
      fillId: "fill-1",
      fieldId: "name",
      text: "Which name?",
      options: [{ label: "Priya", value: "Priya", span }],
      allowFreeText: true,
    },
  },
  {
    type: "flag",
    flag: {
      id: "flag-1",
      fillId: "fill-1",
      fieldIds: ["name"],
      message: "Check this",
      severity: "warning",
    },
  },
  { type: "no_evidence", fillId: "fill-1", fieldId: "phone" },
  {
    type: "dropped",
    fillId: "fill-1",
    fieldId: "secret",
    reason: "policy_human",
    detail: "Human input required",
  },
  { type: "ping" },
  {
    type: "done",
    fillId: "fill-1",
    counts: { proposals: 1, questions: 1, flags: 1 },
    usage: { inputTokens: 10, outputTokens: 20 },
  },
  {
    type: "error",
    fillId: "fill-1",
    message: "Failed",
    retryable: true,
  },
];

describe("fill event protocol", () => {
  it("round-trips every event type", async () => {
    for (const event of events) {
      expect(encodeFillEvent(event).endsWith("\n")).toBe(true);
      expect(
        await collect(streamFromStrings([encodeFillEvent(event)])),
      ).toEqual([event]);
      expect(isFillEvent(event)).toBe(true);
    }
    expect(isFillEvent({ type: "unknown" })).toBe(false);
  });

  it("parses a stream delivered in one-byte chunks", async () => {
    const encoded = events.map(encodeFillEvent).join("");
    expect(await collect(streamFromStrings([...encoded]))).toEqual(events);
  });

  it("parses three lines from one chunk and skips blank lines", async () => {
    const selected = [events[0], events[6], events[7]] as FillEvent[];
    const contents = `${encodeFillEvent(selected[0] as FillEvent)}\n${encodeFillEvent(
      selected[1] as FillEvent,
    )}${encodeFillEvent(selected[2] as FillEvent)}`;
    expect(await collect(streamFromStrings([contents]))).toEqual(selected);
  });

  it("yields one non-retryable error for a malformed line and stops", async () => {
    const parsed = await collect(
      streamFromStrings([
        `${encodeFillEvent(events[0] as FillEvent)}not-json\n${encodeFillEvent({ type: "ping" })}`,
      ]),
    );

    expect(parsed[0]).toEqual(events[0]);
    expect(parsed[1]).toMatchObject({
      type: "error",
      fillId: "",
      retryable: false,
    });
    expect(parsed).toHaveLength(2);
  });

  it("attempts to parse a non-empty trailing partial line", async () => {
    const ping = JSON.stringify({ type: "ping" });
    expect(await collect(streamFromStrings([ping]))).toEqual([
      { type: "ping" },
    ]);
    expect(await collect(streamFromStrings(["   "]))).toEqual([]);
  });
});
