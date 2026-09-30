import {
  createSource,
  type FillEvent,
  type FillRequest,
  serializeForm,
} from "@sourced/core";
import { jobApplicationForm, loadResume } from "@sourced/examples";
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
  it("finishes an empty check without retrying or erroring", async () => {
    let calls = 0;
    const empty = createFakeAdapter([]);
    const adapter: ModelAdapter = {
      streamItems(input) {
        calls += 1;
        return empty.streamItems(input);
      },
    };

    const events = await collect(
      fill({ ...request(), mode: "check", currentValues: {} }, { adapter }),
    );

    expect(calls).toBe(1);
    expect(events.map((event) => event.type)).toEqual(["start", "done"]);
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "error" }),
    );
  });

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

  it("drops proposals from check mode at the server boundary", async () => {
    const events = await collect(
      fill(
        { ...request(), mode: "check", currentValues: { fullName: "Priya" } },
        {
          adapter: createFakeAdapter([
            {
              kind: "proposal",
              fieldId: "fullName",
              basis: "extracted",
              value: "Priya Raman",
              sourceId: "priya",
              quote: "Priya Raman",
            },
            {
              kind: "proposal",
              fieldId: "email",
              basis: "extracted",
              value: "priya.raman@example.com",
              sourceId: "priya",
              quote: "priya.raman@example.com",
            },
          ]),
          idGen: () => "check-fill",
        },
      ),
    );

    expect(events.filter((event) => event.type === "proposal")).toEqual([]);
    expect(events.filter((event) => event.type === "dropped")).toEqual([
      {
        type: "dropped",
        fillId: "check-fill",
        fieldId: "fullName",
        reason: "check-mode",
      },
      {
        type: "dropped",
        fillId: "check-fill",
        fieldId: "email",
        reason: "check-mode",
      },
    ]);
    expect(events.at(-1)).toEqual({
      type: "done",
      fillId: "check-fill",
      counts: { proposals: 0, questions: 0, flags: 0 },
      usage: { inputTokens: 0, outputTokens: 0 },
    });
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

  it("reports an error when a check times out", async () => {
    const events = await collect(
      fill(
        { ...request(), mode: "check" },
        {
          adapter: createFakeAdapter([{ delayMs: 100 }]),
          firstItemTimeoutMs: 5,
        },
      ),
    );
    expect(events.at(-1)).toMatchObject({
      type: "error",
      retryable: true,
      message: expect.stringContaining("timed out"),
    });
    expect(events.some((event) => event.type === "done")).toBe(false);
  });

  it.each([
    {
      fieldId: "yearsExperience",
      value: "9",
      quote: "9",
      text: "Experience: 19",
    },
    {
      fieldId: "yearsExperience",
      value: "9",
      quote: "9",
      text: "Experience: -9",
    },
    { fieldId: "skills", values: ["go"], quote: "go", text: "Django" },
    {
      fieldId: "currentlyEmployed",
      value: "true",
      quote: "y",
      text: "yesterday",
    },
  ])(
    "does not extract partial tokens for $fieldId",
    async ({ text, ...item }) => {
      const source = createSource({
        id: "boundary",
        name: "Boundary",
        kind: "paste",
        text,
      });
      const events = await collect(
        fill(
          { ...request(), sources: [source] },
          {
            adapter: createFakeAdapter([
              {
                kind: "proposal",
                basis: "extracted",
                sourceId: source.id,
                ...item,
              },
            ]),
          },
        ),
      );
      expect(
        events.some(
          (event) =>
            event.type === "proposal" && event.proposal.kind === "extracted",
        ),
      ).toBe(false);
      expect(
        events.some(
          (event) => event.type === "question" || event.type === "proposal",
        ),
      ).toBe(true);
    },
  );

  it("completes a normally empty check", async () => {
    const events = await collect(
      fill({ ...request(), mode: "check" }, { adapter: createFakeAdapter([]) }),
    );
    expect(events.at(-1)).toMatchObject({ type: "done" });
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

  it.each([
    {
      format: "comma-separated value",
      item: {
        kind: "proposal",
        fieldId: "skills",
        basis: "extracted",
        value: "typescript, Nodejs, typescript",
      },
    },
    {
      format: "JSON-encoded value",
      item: {
        kind: "proposal",
        fieldId: "skills",
        basis: "extracted",
        value: '["typescript","Node.js","typescript"]',
      },
    },
    {
      format: "values array",
      item: {
        kind: "proposal",
        fieldId: "skills",
        basis: "extracted",
        values: ["typescript", "Node.js", "typescript"],
      },
    },
  ])("coerces a multiselect $format", async ({ item }) => {
    const events = await collect(
      fill(request(), {
        adapter: createFakeAdapter([
          {
            ...item,
            sourceId: "priya",
            quote: "TypeScript, React, Node.js, SQL, AWS, Docker, Kubernetes",
          },
        ]),
      }),
    );

    expect(events.find((event) => event.type === "proposal")).toMatchObject({
      type: "proposal",
      proposal: {
        fieldId: "skills",
        value: ["typescript", "node-js"],
      },
    });
  });

  it("drops unknown multiselect entries and deduplicates known ones", async () => {
    const events = await collect(
      fill(request(), {
        adapter: createFakeAdapter([
          {
            kind: "proposal",
            fieldId: "skills",
            basis: "extracted",
            value: "TypeScript; COBOL\nNode.js; typescript",
            sourceId: "priya",
            quote: "TypeScript, React, Node.js, SQL, AWS, Docker, Kubernetes",
          },
        ]),
      }),
    );

    expect(events.find((event) => event.type === "proposal")).toMatchObject({
      type: "proposal",
      proposal: { value: ["typescript", "node-js"] },
    });
  });

  it("drops an all-unknown multiselect with a useful detail", async () => {
    const events = await collect(
      fill(request(), {
        adapter: createFakeAdapter([
          {
            kind: "proposal",
            fieldId: "skills",
            basis: "inferred",
            value: "COBOL, Fortran",
          },
          { kind: "no_evidence", fieldId: "phone" },
        ]),
      }),
    );

    expect(events).toContainEqual({
      type: "dropped",
      fillId: expect.any(String),
      fieldId: "skills",
      reason: "invalid_value",
      detail: "no known options",
    });
  });

  it.each([
    { fieldId: "phone", value: " NO_EVIDENCE " },
    { fieldId: "gradYear", value: "" },
  ])(
    "turns a $fieldId proposal with a sentinel value into no_evidence",
    async ({ fieldId, value }) => {
      const events = await collect(
        fill(request(), {
          adapter: createFakeAdapter([{ kind: "proposal", fieldId, value }]),
        }),
      );

      expect(events.map((event) => event.type)).toEqual([
        "start",
        "no_evidence",
        "done",
      ]);
      expect(events[1]).toMatchObject({ type: "no_evidence", fieldId });
    },
  );

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

  it("times out twice before returning the empty-response error", async () => {
    let calls = 0;
    const delayed = createFakeAdapter([
      { delayMs: 30 },
      { kind: "no_evidence", fieldId: "phone" },
    ]);
    const adapter: ModelAdapter = {
      streamItems(input) {
        calls += 1;
        return delayed.streamItems(input);
      },
    };

    const events = await collect(
      fill(request(), { adapter, firstItemTimeoutMs: 5 }),
    );

    expect(calls).toBe(2);
    expect(events.map((event) => event.type)).toEqual(["start", "error"]);
    expect(events.at(-1)).toMatchObject({
      message: "model returned no items",
      retryable: true,
    });
  });

  it("does not time out after an item arrives in time", async () => {
    let calls = 0;
    const timely = createFakeAdapter([
      { delayMs: 1 },
      { kind: "no_evidence", fieldId: "phone" },
      { delayMs: 20 },
    ]);
    const adapter: ModelAdapter = {
      streamItems(input) {
        calls += 1;
        return timely.streamItems(input);
      },
    };

    const events = await collect(
      fill(request(), { adapter, firstItemTimeoutMs: 10 }),
    );

    expect(calls).toBe(1);
    expect(events.map((event) => event.type)).toEqual([
      "start",
      "no_evidence",
      "done",
    ]);
  });

  it("returns silently when the client aborts before the first item", async () => {
    let calls = 0;
    const controller = new AbortController();
    const delayed = createFakeAdapter([
      { delayMs: 100 },
      { kind: "no_evidence", fieldId: "phone" },
    ]);
    const adapter: ModelAdapter = {
      streamItems(input) {
        calls += 1;
        return delayed.streamItems(input);
      },
    };
    const eventsPromise = collect(
      fill(request(), {
        adapter,
        signal: controller.signal,
        firstItemTimeoutMs: 1_000,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();

    const events = await eventsPromise;
    expect(calls).toBe(1);
    expect(events.map((event) => event.type)).toEqual(["start"]);
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
