import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { locateQuote, normalizeTextForQuoteLocation } from "./locate";

describe("locateQuote", () => {
  it("finds exact text and returns the source quote", () => {
    expect(locateQuote("before exact quote after", "exact quote")).toEqual({
      start: 7,
      end: 18,
      quote: "exact quote",
      match: "exact",
    });
  });

  it("uses hintOffset to choose the nearest exact occurrence", () => {
    expect(
      locateQuote("same then same", "same", { hintOffset: 12 })?.start,
    ).toBe(10);
    expect(locateQuote("same then same", "same")?.start).toBe(0);
  });

  it.each([
    ["She said “Hello” today.", 'she said "hello" today.'],
    ["alpha   beta\ngamma", "alpha beta gamma"],
    ["well–tested software", "well-tested software"],
    ["a fault-toler-\nant system", "a fault-tolerant system"],
    ["Mixed Case Value", "MIXED CASE VALUE"],
  ])("finds normalized variants in %j", (text, quote) => {
    const result = locateQuote(text, quote);
    expect(result?.match).toBe("normalized");
    expect(result?.start).toBe(0);
    expect(result?.end).toBe(text.length);
    expect(text.slice(result?.start, result?.end)).toBe(result?.quote);
  });

  it("finds a fuzzy hit with one substituted word", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta iota";
    const quote = "alpha beta gamma delta changed zeta eta theta iota";
    const result = locateQuote(text, quote);

    expect(result).toEqual({
      start: 0,
      end: text.length,
      quote: text,
      match: "fuzzy",
    });
  });

  it("returns null for a miss", () => {
    expect(locateQuote("nothing relevant here", "alpha beta gamma")).toBeNull();
  });

  it("does not fuzz quotes over the configured length cap", () => {
    const text = `one two three ${"middle ".repeat(20)}seven eight nine`;
    const quote = `one two three ${"changed ".repeat(20)}seven eight nine`;
    expect(
      locateQuote(text, quote, {
        maxFuzzyQuoteLength: 50,
        minSimilarity: 0,
      }),
    ).toBeNull();
  });

  it("maps normalized token slices back to equivalent original slices", () => {
    const original = "  Alpha\r\n  BETA — “hy-\nphen” and Cafe\u0301.  ";
    const normalized = normalizeTextForQuoteLocation(original);
    const tokens = [...normalized.text.matchAll(/\S+/gu)].map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
    }));

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: tokens.length - 1 }),
        fc.integer({ min: 0, max: tokens.length - 1 }),
        (left, right) => {
          const first = tokens[Math.min(left, right)];
          const last = tokens[Math.max(left, right)];
          if (!first || !last) {
            return false;
          }
          const originalStart = normalized.starts[first.start];
          const originalEnd = normalized.ends[last.end - 1];
          if (originalStart === undefined || originalEnd === undefined) {
            return false;
          }
          const originalSlice = original.slice(originalStart, originalEnd);
          return (
            normalizeTextForQuoteLocation(originalSlice).text ===
            normalized.text.slice(first.start, last.end)
          );
        },
      ),
    );
  });

  it("always returns a quote equal to the indicated source slice", () => {
    const cases = [
      ["an exact value", "exact value"],
      ["curly “quote” here", 'curly "QUOTE" here'],
      [
        "alpha beta gamma delta epsilon zeta eta theta iota",
        "alpha beta gamma delta changed zeta eta theta iota",
      ],
    ] as const;

    for (const [text, quote] of cases) {
      const result = locateQuote(text, quote);
      expect(result).not.toBeNull();
      expect(text.slice(result?.start, result?.end)).toBe(result?.quote);
    }
  });
});
