import { locateQuote } from "@sourced/core";
import { describe, expect, it } from "vitest";

import { listResumes, loadGold, loadResume } from "./index";

function curlyQuotes(quote: string): string {
  return quote.replace(/'/g, "’").replace(/"/g, "”");
}

function insertNewline(quote: string): string {
  return quote.replace(/\s+/u, "\n");
}

function insertHyphenatedLineBreak(quote: string): string {
  return quote.replace(/\p{L}{6,}/u, (word) => {
    const middle = Math.floor(word.length / 2);
    return `${word.slice(0, middle)}-\n${word.slice(middle)}`;
  });
}

describe("gold quote location", () => {
  it("locates every gold quote exactly at indexOf", () => {
    const gold = loadGold();

    for (const resumeName of listResumes()) {
      const resume = loadResume(resumeName);
      for (const [fieldId, expected] of Object.entries(
        gold[resumeName].fields,
      )) {
        if (expected.quote === undefined) {
          continue;
        }
        const start = resume.indexOf(expected.quote);
        expect(
          locateQuote(resume, expected.quote),
          `${resumeName}:${fieldId}`,
        ).toEqual({
          start,
          end: start + expected.quote.length,
          quote: expected.quote,
          match: "exact",
        });
      }
    }
  });

  it("locates at least 95% of perturbed gold quotes at the exact offsets", () => {
    const gold = loadGold();
    let hits = 0;
    let attempts = 0;

    for (const resumeName of listResumes()) {
      const resume = loadResume(resumeName);
      for (const expected of Object.values(gold[resumeName].fields)) {
        if (expected.quote === undefined) {
          continue;
        }
        const exactStart = resume.indexOf(expected.quote);
        const perturbations = [
          curlyQuotes(expected.quote),
          expected.quote.replace(/\s+/gu, " "),
          insertNewline(expected.quote),
          insertHyphenatedLineBreak(expected.quote),
          expected.quote.toUpperCase(),
        ];

        for (const quote of perturbations) {
          attempts += 1;
          const located = locateQuote(resume, quote);
          if (
            located?.start === exactStart &&
            located.end === exactStart + expected.quote.length
          ) {
            hits += 1;
          }
        }
      }
    }

    const hitRate = hits / attempts;
    console.info(
      `Gold quote perturbation hit rate: ${(hitRate * 100).toFixed(1)}%`,
    );
    expect(hitRate).toBeGreaterThanOrEqual(0.95);
  });
});
