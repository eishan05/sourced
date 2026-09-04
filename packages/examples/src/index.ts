import { readFileSync } from "node:fs";

import type { FieldValue } from "@sourced/core";

export { jobApplicationForm } from "../forms/job-application";
export { medicalIntakeForm } from "../forms/medical-intake";

const RESUME_NAMES = [
  "lena-fischer.txt",
  "marcus-oyelaran.txt",
  "priya-raman.txt",
] as const;

export type ResumeName = (typeof RESUME_NAMES)[number];

const INTAKE_NAMES = ["maya-chen.txt", "jordan-ellis.txt"] as const;

export type IntakeName = (typeof INTAKE_NAMES)[number];

const RESUME_URLS: Record<ResumeName, URL> = {
  "lena-fischer.txt": new URL(
    "../fixtures/resumes/lena-fischer.txt",
    import.meta.url,
  ),
  "marcus-oyelaran.txt": new URL(
    "../fixtures/resumes/marcus-oyelaran.txt",
    import.meta.url,
  ),
  "priya-raman.txt": new URL(
    "../fixtures/resumes/priya-raman.txt",
    import.meta.url,
  ),
};

const INTAKE_URLS: Record<IntakeName, URL> = {
  "maya-chen.txt": new URL("../fixtures/intake/maya-chen.txt", import.meta.url),
  "jordan-ellis.txt": new URL(
    "../fixtures/intake/jordan-ellis.txt",
    import.meta.url,
  ),
};

export interface GoldField {
  value: FieldValue;
  quote?: string;
  kind: "extracted" | "inferred";
}

export type GoldFixture = Record<
  ResumeName,
  { fields: Record<string, GoldField> }
>;

export type MedicalIntakeGoldFixture = Record<
  IntakeName,
  { fields: Record<string, GoldField> }
>;

export function listResumes(): ResumeName[] {
  return [...RESUME_NAMES];
}

export function loadResume(name: ResumeName): string {
  if (!(RESUME_NAMES as readonly string[]).includes(name)) {
    throw new Error(`Unknown resume fixture: ${name}`);
  }

  return readFileSync(RESUME_URLS[name], "utf8");
}

export function listIntakeNotes(): IntakeName[] {
  return [...INTAKE_NAMES];
}

export function loadIntakeNote(name: IntakeName): string {
  if (!(INTAKE_NAMES as readonly string[]).includes(name)) {
    throw new Error(`Unknown intake fixture: ${name}`);
  }

  return readFileSync(INTAKE_URLS[name], "utf8");
}

export function loadGold(): GoldFixture {
  const contents = readFileSync(
    new URL("../fixtures/gold/job-application.json", import.meta.url),
    "utf8",
  );
  return JSON.parse(contents) as GoldFixture;
}

export function loadMedicalIntakeGold(): MedicalIntakeGoldFixture {
  const contents = readFileSync(
    new URL("../fixtures/gold/medical-intake.json", import.meta.url),
    "utf8",
  );
  return JSON.parse(contents) as MedicalIntakeGoldFixture;
}
