import { createSource, type FillRequest, serializeForm } from "@sourced/core";
import { jobApplicationForm } from "@sourced/examples";
import { describe, expect, it } from "vitest";

import { fill } from "../src/fill";
import { createFakeAdapter } from "../src/model/fake";
import { collectTimedFillEvents } from "./eval-fill-metrics";

describe("eval-fill timing", () => {
  it("measures time to the first proposal from a fake adapter", async () => {
    const request: FillRequest = {
      form: serializeForm(jobApplicationForm),
      sources: [
        createSource({
          id: "resume",
          name: "resume.txt",
          kind: "paste",
          text: "Priya Raman",
          now: 0,
        }),
      ],
      mode: "fill",
      today: "2026-09-03",
    };
    const adapter = createFakeAdapter([
      {
        kind: "proposal",
        fieldId: "fullName",
        basis: "extracted",
        value: "Priya Raman",
        sourceId: "resume",
        quote: "Priya Raman",
      },
    ]);
    const times = [100, 125, 180];

    const result = await collectTimedFillEvents(
      fill(request, { adapter, idGen: () => "timed-fill" }),
      () => times.shift() ?? 180,
    );

    expect(result.firstItemMs).toBe(25);
    expect(result.latencyMs).toBe(80);
    expect(result.events.map((event) => event.type)).toEqual([
      "start",
      "proposal",
      "done",
    ]);
  });
});
