import { describe, expect, it } from "vitest";

import { createSource } from "./source";

describe("createSource", () => {
  it("normalizes source text without collapsing or trimming whitespace", () => {
    const source = createSource({
      id: "source-1",
      now: 123,
      name: "Resume",
      kind: "paste",
      text: "Cafe\u0301\r\nA\rB\tC\u00adD\u200bE\u200cF\u200dG\ufeffH  \n",
    });

    expect(source).toEqual({
      id: "source-1",
      name: "Resume",
      kind: "paste",
      text: "Café\nA\nB CDEFGH  \n",
      addedAt: 123,
    });
  });

  it("joins normalized pages and records each page start", () => {
    const source = createSource({
      id: "pdf-1",
      now: 456,
      name: "Resume.pdf",
      kind: "pdf",
      text: "ignored when pages are supplied",
      pageTexts: ["e\u0301\r\nx", "\ty\u00ad", "z"],
    });

    expect(source.text).toBe("é\nx\n\n y\n\nz");
    expect(source.pageOffsets).toEqual([0, 5, 9]);
  });

  it("generates an id and timestamp when omitted", () => {
    const before = Date.now();
    const source = createSource({ name: "Paste", kind: "paste", text: "x" });

    expect(source.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(source.addedAt).toBeGreaterThanOrEqual(before);
    expect(source.addedAt).toBeLessThanOrEqual(Date.now());
  });
});
