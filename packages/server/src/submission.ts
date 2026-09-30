import {
  type FieldValue,
  type FormDefinition,
  fieldsOf,
  isFieldVisible,
  type SerializedFormDefinition,
  type ValidationIssue,
  validateField,
} from "@sourced/core";
import { z } from "zod";

export interface SubmissionIssue extends ValidationIssue {
  fieldId?: string;
}

export type SubmissionValidation =
  | { success: true; values: Record<string, FieldValue> }
  | { success: false; issues: SubmissionIssue[] };

const ValuesSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
);

/** Validate against a trusted server-owned definition, never a client-supplied form. */
export function validateSubmission(
  form: FormDefinition | SerializedFormDefinition,
  input: unknown,
): SubmissionValidation {
  const parsed = ValuesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "invalid_payload",
        message: "Submission must contain a record of supported field values.",
        severity: "error",
        ...(typeof issue.path[0] === "string"
          ? { fieldId: issue.path[0] }
          : {}),
      })),
    };
  }
  const fields = fieldsOf(form);
  const knownIds = new Set(fields.map((field) => field.id));
  const issues: SubmissionIssue[] = Object.keys(parsed.data)
    .filter((id) => !knownIds.has(id))
    .map((fieldId) => ({
      fieldId,
      code: "unknown_field",
      message: "Unknown field.",
      severity: "error",
    }));
  const entries: Array<[string, FieldValue]> = [];
  for (const field of fields) {
    if (!isFieldVisible(form, field.id, parsed.data)) continue;
    const value = parsed.data[field.id] ?? null;
    issues.push(
      ...validateField(field, value).map((issue) => ({
        ...issue,
        fieldId: field.id,
      })),
    );
    entries.push([field.id, value]);
  }
  return issues.length > 0
    ? { success: false, issues }
    : { success: true, values: Object.fromEntries(entries) };
}
