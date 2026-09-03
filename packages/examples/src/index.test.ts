import {
  defineForm,
  fieldById,
  policyOf,
  validateField,
} from "@ai-native-forms/core";
import { describe, expect, it } from "vitest";

import { jobApplicationForm, listResumes, loadGold, loadResume } from "./index";

describe("examples", () => {
  it("defines a valid job application form", () => {
    expect(() => defineForm(jobApplicationForm)).not.toThrow();
    expect(jobApplicationForm.id).toBe("job-application");
  });

  it("lists the three resume fixture names", () => {
    expect(listResumes()).toEqual([
      "lena-fischer.txt",
      "marcus-oyelaran.txt",
      "priya-raman.txt",
    ]);
  });

  it("uses exact resume substrings for every gold quote", () => {
    const gold = loadGold();

    for (const resumeName of listResumes()) {
      const resume = loadResume(resumeName);
      for (const [fieldId, expected] of Object.entries(
        gold[resumeName].fields,
      )) {
        if (expected.quote !== undefined) {
          expect(
            resume.indexOf(expected.quote),
            `${resumeName}:${fieldId} quote`,
          ).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("provides valid gold values and excludes human-policy fields", () => {
    const gold = loadGold();

    for (const resumeName of listResumes()) {
      for (const [fieldId, expected] of Object.entries(
        gold[resumeName].fields,
      )) {
        const definition = fieldById(jobApplicationForm, fieldId);
        expect(definition, `${resumeName}:${fieldId} definition`).toBeDefined();
        if (!definition) {
          throw new Error(`Missing definition for ${fieldId}`);
        }
        expect(
          policyOf(definition),
          `${resumeName}:${fieldId} policy`,
        ).not.toBe("human");
        expect(
          validateField(definition, expected.value),
          `${resumeName}:${fieldId} value`,
        ).toEqual([]);
      }
    }
  });
});
