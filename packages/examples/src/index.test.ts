import { defineForm, fieldById, policyOf, validateField } from "@sourced/core";
import { describe, expect, it } from "vitest";

import {
  jobApplicationForm,
  listIntakeNotes,
  listResumes,
  loadGold,
  loadIntakeNote,
  loadMedicalIntakeGold,
  loadResume,
  medicalIntakeForm,
} from "./index";

describe("examples", () => {
  it("defines a valid job application form", () => {
    expect(() => defineForm(jobApplicationForm)).not.toThrow();
    expect(jobApplicationForm.id).toBe("job-application");
  });

  it("defines a valid medical intake form", () => {
    expect(() => defineForm(medicalIntakeForm)).not.toThrow();
    expect(medicalIntakeForm.id).toBe("medical-intake");
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

  it("provides valid medical intake gold values with exact quotes", () => {
    const gold = loadMedicalIntakeGold();

    for (const noteName of listIntakeNotes()) {
      const note = loadIntakeNote(noteName);
      for (const [fieldId, expected] of Object.entries(gold[noteName].fields)) {
        if (expected.quote !== undefined) {
          expect(
            note.indexOf(expected.quote),
            `${noteName}:${fieldId} quote`,
          ).toBeGreaterThanOrEqual(0);
        }
        const definition = fieldById(medicalIntakeForm, fieldId);
        expect(definition, `${noteName}:${fieldId} definition`).toBeDefined();
        if (definition) {
          expect(policyOf(definition)).not.toBe("human");
          if (expected.value !== null) {
            expect(validateField(definition, expected.value)).toEqual([]);
          }
        }
      }
    }
  });
});
