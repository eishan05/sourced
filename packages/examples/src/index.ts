import { readFileSync } from "node:fs";

import type { FieldValue } from "@ai-native-forms/core";

export { jobApplicationForm } from "../forms/job-application";

const RESUME_NAMES = [
  "lena-fischer.txt",
  "marcus-oyelaran.txt",
  "priya-raman.txt",
] as const;

export type ResumeName = (typeof RESUME_NAMES)[number];

export interface GoldField {
  value: FieldValue;
  quote?: string;
  kind: "extracted" | "inferred";
}

export type GoldFixture = Record<
  ResumeName,
  { fields: Record<string, GoldField> }
>;

export function listResumes(): ResumeName[] {
  return [...RESUME_NAMES];
}

export function loadResume(name: ResumeName): string {
  if (!(RESUME_NAMES as readonly string[]).includes(name)) {
    throw new Error(`Unknown resume fixture: ${name}`);
  }

  return readFileSync(
    new URL(`../fixtures/resumes/${name}`, import.meta.url),
    "utf8",
  );
}

export function loadGold(): GoldFixture {
  const contents = readFileSync(
    new URL("../fixtures/gold/job-application.json", import.meta.url),
    "utf8",
  );
  return JSON.parse(contents) as GoldFixture;
}
