import { describe, expect, it } from "vitest";

import { locateItem, locateModelQuote } from "./locate";
import { makeContext, testSources } from "./test-helpers";

describe("locateItem", () => {
  it("locates a quote and uses source text for the span", () => {
    const result = locateItem(
      {
        kind: "proposal",
        fieldId: "name",
        basis: "extracted",
        raw: "Ada Lovelace",
        value: "Ada Lovelace",
        quote: "Ada Lovelace",
      },
      makeContext(),
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        span: {
          sourceId: "resume",
          start: 0,
          end: 12,
          quote: "Ada Lovelace",
          match: "exact",
        },
      },
    });
  });

  it("tries every source when sourceId is unknown", () => {
    const result = locateModelQuote("Engineer", "hallucinated", testSources);
    expect(result.span?.sourceId).toBe("resume");
  });

  it("truncates long quotes before locating", () => {
    const quote = "x".repeat(301);
    const source = testSources[0];
    if (!source) throw new Error("Missing test source");
    const result = locateModelQuote(quote, undefined, [
      { ...source, text: "x".repeat(300) },
    ]);
    expect(result.quote).toHaveLength(300);
    expect(result.span?.end).toBe(300);
  });
});
