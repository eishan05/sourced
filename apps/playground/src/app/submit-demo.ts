import type { FieldValue } from "@sourced/core";

export async function submitDemo(
  form: { id: string; version: number },
  values: Record<string, FieldValue>,
): Promise<Record<string, FieldValue>> {
  const response = await fetch("/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      formId: form.id,
      formVersion: form.version,
      values,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(
      result.error ??
        result.issues
          ?.map(
            (issue: { fieldId?: string; message: string }) =>
              `${issue.fieldId ? `${issue.fieldId}: ` : ""}${issue.message}`,
          )
          .join(" ") ??
        "Server validation failed. Please retry.",
    );
  }
  return result.values;
}
