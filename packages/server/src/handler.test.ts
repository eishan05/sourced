import {
  createSource,
  type FillEvent,
  type FillRequest,
  parseFillEvents,
  serializeForm,
} from "@sourced/core";
import { jobApplicationForm } from "@sourced/examples";
import { describe, expect, it } from "vitest";

import { createFillHandler } from "./handler";
import { createFakeAdapter } from "./model/fake";

const body: FillRequest = {
  form: serializeForm(jobApplicationForm),
  sources: [
    createSource({
      id: "resume",
      name: "Resume",
      kind: "paste",
      text: "Priya Raman",
      now: 0,
    }),
  ],
  mode: "fill",
  today: "2026-09-03",
};

async function parsedEvents(response: Response): Promise<FillEvent[]> {
  if (!response.body) throw new Error("Missing response body");
  const events = [];
  for await (const event of parseFillEvents(response.body)) events.push(event);
  return events;
}

describe("createFillHandler", () => {
  it("returns an NDJSON stream that parses as core events", async () => {
    const handler = createFillHandler({
      adapter: createFakeAdapter([
        { kind: "no_evidence", fieldId: "fullName" },
      ]),
      idGen: () => "fill",
    });
    const response = await handler(
      new Request("http://x/fill", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/x-ndjson; charset=utf-8",
    );
    expect(await parsedEvents(response)).toEqual([
      {
        type: "start",
        fillId: "fill",
        targetFieldIds: body.form.sections
          .flatMap((section) => section.fields)
          .filter((field) => field.policy !== "human")
          .map((field) => field.id),
      },
      { type: "no_evidence", fillId: "fill", fieldId: "fullName" },
      {
        type: "done",
        fillId: "fill",
        counts: { proposals: 0, questions: 0, flags: 0 },
        usage: { inputTokens: 0, outputTokens: 0 },
      },
    ]);
  });

  it("returns 400 for an invalid body and 405 for GET", async () => {
    const handler = createFillHandler({ adapter: createFakeAdapter([]) });
    const invalid = await handler(
      new Request("http://x/fill", { method: "POST", body: "{}" }),
    );
    const get = await handler(new Request("http://x/fill"));
    expect(invalid.status).toBe(400);
    expect(get.status).toBe(405);
    expect(get.headers.get("allow")).toBe("POST");
  });

  it("returns 413 when the body exceeds the configured limit", async () => {
    const handler = createFillHandler({
      adapter: createFakeAdapter([]),
      maxBodyBytes: 2,
    });
    const response = await handler(
      new Request("http://x/fill", { method: "POST", body: "{} " }),
    );
    expect(response.status).toBe(413);
  });

  it("emits a ping while the model is quiet", async () => {
    const handler = createFillHandler({
      adapter: createFakeAdapter([
        { delayMs: 20 },
        { kind: "no_evidence", fieldId: "fullName" },
      ]),
      pingMs: 5,
    });
    const response = await handler(
      new Request("http://x/fill", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
    const events = await parsedEvents(response);
    expect(events.some((event) => event.type === "ping")).toBe(true);
    expect(events.at(-1)?.type).toBe("done");
  });
});
