import {
  createSource,
  type FillEvent,
  type FillRequest,
  serializeForm,
} from "@ai-native-forms/core";
import { jobApplicationForm, loadResume } from "@ai-native-forms/examples";
import { describe, expect, it } from "vitest";

import { fill } from "./fill";
import type { ModelAdapter } from "./model/adapter";
import { createFakeAdapter } from "./model/fake";

function request(text = loadResume("priya-raman.txt")): FillRequest {
  return {
    form: serializeForm(jobApplicationForm),
    sources: [
      createSource({
        id: "priya",
        name: "Priya Raman resume",
        kind: "paste",
        text,
        now: 0,
      }),
    ],
    mode: "fill",
    today: "2026-09-03",
  };
}

async function collect(events: AsyncIterable<FillEvent>): Promise<FillEvent[]> {
  const result = [];
  for await (const event of events) result.push(event);
  return result;
}

describe("fill", () => {
  it("runs check mode with current values and no target fields", async () => {
    let modelPrompt = "";
    let modelSystem = "";
    const fake = createFakeAdapter([
      {
        kind: "flag",
        fieldIds: ["startDate", "gradYear"],
        message: "The employment start date is before graduation.",
        severity: "error",
      },
    ]);
    const adapter: ModelAdapter = {
      streamItems(input) {
        modelPrompt = input.prompt;
        modelSystem = input.system;
        return fake.streamItems(input);
      },
    };
    const events = await collect(
      fill(
        {
          ...request(loadResume("lena-fischer.txt")),
          mode: "check",
          currentValues: {
            startDate: "2016-01-01",
            gradYear: 2019,
          },
        },
        {
          adapter,
          idGen: (() => {
            let id = 0;
            return () => `check-${++id}`;
          })(),
        },
      ),
    );

    expect(events[0]).toEqual({
      type: "start",
      fillId: "check-1",
      targetFieldIds: [],
    });
    expect(events).toContainEqual({
      type: "flag",
      flag: {
        id: "check-2",
        fillId: "check-1",
        fieldIds: ["startDate", "gradYear"],
        message: "The employment start date is before graduation.",
        severity: "error",
      },
    });
    expect(modelPrompt).toContain("<current_values>");
    expect(modelPrompt).toContain('"startDate":"2016-01-01"');
    expect(modelSystem).toContain("emit only flag and question");
  });

  it("streams proposals before later model items are consumed", async () => {
    const adapter = createFakeAdapter([
      {
        kind: "proposal",
        fieldId: "fullName",
        basis: "extracted",
        value: "Priya Raman",
        sourceId: "priya",
        quote: "Priya Raman",
      },
      { delayMs: 30 },
      { kind: "no_evidence", fieldId: "phone" },
    ]);
    const iterator = fill(request(), { adapter })[Symbol.asyncIterator]();

    expect((await iterator.next()).value?.type).toBe("start");
    expect((await iterator.next()).value?.type).toBe("proposal");

    let laterResolved = false;
    const later = iterator.next().then((result) => {
      laterResolved = true;
      return result;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(laterResolved).toBe(false);
    expect((await later).value?.type).toBe("no_evidence");
    expect((await iterator.next()).value?.type).toBe("done");
  });

  it("drops a malformed item without ending the stream", async () => {
    const events = await collect(
      fill(request(), {
        adapter: createFakeAdapter([
          {
            kind: "proposal",
            fieldId: "email",
            basis: "extracted",
            value: 42,
          },
          { kind: "no_evidence", fieldId: "email" },
        ]),
      }),
    );
    expect(events.map((event) => event.type)).toEqual([
      "start",
      "dropped",
      "no_evidence",
      "done",
    ]);
    expect(events[1]).toMatchObject({ reason: "malformed" });
  });

  it("keeps Priya's normalized phone extracted and formats it", async () => {
    const events = await collect(
      fill(request(), {
        adapter: createFakeAdapter([
          {
            kind: "proposal",
            fieldId: "phone",
            basis: "extracted",
            value: "+14155550101",
            sourceId: "priya",
            quote: "+1 (415) 555-0101",
          },
        ]),
      }),
    );

    expect(events.find((event) => event.type === "proposal")).toMatchObject({
      type: "proposal",
      proposal: {
        fieldId: "phone",
        kind: "extracted",
        value: "+1 (415) 555-0101",
        span: { quote: "+1 (415) 555-0101" },
      },
    });
    expect(events.some((event) => event.type === "question")).toBe(false);
  });

  it("locates every quoted option emitted by the model", async () => {
    const events = await collect(
      fill(request(), {
        adapter: createFakeAdapter([
          {
            kind: "question",
            fieldId: "employer",
            question: "Which is your current employer?",
            options: [
              {
                label: "Lumen Orchard Systems",
                value: "Lumen Orchard Systems",
                sourceId: "priya",
                quote: "Lumen Orchard Systems",
              },
              {
                label: "Pebble Arc Software",
                value: "Pebble Arc Software",
                sourceId: "priya",
                quote: "Pebble Arc Software",
              },
            ],
            allowFreeText: true,
          },
        ]),
      }),
    );

    const question = events.find((event) => event.type === "question");
    expect(question).toMatchObject({
      type: "question",
      question: {
        options: [
          {
            label: "Lumen Orchard Systems",
            span: { sourceId: "priya", quote: "Lumen Orchard Systems" },
          },
          {
            label: "Pebble Arc Software",
            span: { sourceId: "priya", quote: "Pebble Arc Software" },
          },
        ],
      },
    });
  });

  it("yields a mid-stream adapter error and stops", async () => {
    const events = await collect(
      fill(request(), {
        adapter: createFakeAdapter([
          { kind: "no_evidence", fieldId: "email" },
          { error: new Error("provider unavailable"), retryable: true },
          { kind: "no_evidence", fieldId: "phone" },
        ]),
      }),
    );
    expect(events.map((event) => event.type)).toEqual([
      "start",
      "no_evidence",
      "error",
    ]);
    expect(events.at(-1)).toMatchObject({
      message: "provider unavailable",
      retryable: true,
    });
  });

  it("retries once with the strict reminder after zero items", async () => {
    const systems: string[] = [];
    const empty = createFakeAdapter([]);
    const adapter: ModelAdapter = {
      streamItems(input) {
        systems.push(input.system);
        return empty.streamItems(input);
      },
    };
    const events = await collect(fill(request(), { adapter }));
    expect(systems).toHaveLength(2);
    expect(systems[0]).not.toContain("Return only the JSON array");
    expect(systems[1]).toContain("Return only the JSON array");
    expect(events.map((event) => event.type)).toEqual(["start", "error"]);
    expect(events.at(-1)).toMatchObject({
      message: "model returned no items",
      retryable: true,
    });
  });

  it("rejects oversized sources without calling the adapter", async () => {
    let calls = 0;
    const empty = createFakeAdapter([]);
    const adapter: ModelAdapter = {
      streamItems(input) {
        calls += 1;
        return empty.streamItems(input);
      },
    };
    const events = await collect(
      fill(request("too long"), { adapter, maxSourceChars: 3 }),
    );
    expect(calls).toBe(0);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      type: "error",
      retryable: false,
    });
  });
});
