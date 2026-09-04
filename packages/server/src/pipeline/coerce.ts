import {
  type FieldValue,
  type NormalizedValue,
  normalizePhone,
  normalizeValue,
  validateField,
} from "@sourced/core";

import type {
  CoercedItem,
  PipelineContext,
  PipelineResult,
  ValidatedItem,
} from "./types";

function optionValue(
  raw: string,
  options: ReadonlyArray<{ value: string; label: string }>,
): string | undefined {
  const trimmed = raw.trim();
  const exactValue = options.find((option) => option.value === trimmed);
  if (exactValue) return exactValue.value;

  const lower = trimmed.toLowerCase();
  const caseInsensitiveValue = options.find(
    (option) => option.value.toLowerCase() === lower,
  );
  if (caseInsensitiveValue) return caseInsensitiveValue.value;

  const caseInsensitiveLabel = options.find(
    (option) => option.label.toLowerCase() === lower,
  );
  if (caseInsensitiveLabel) return caseInsensitiveLabel.value;

  const slug = lower.replace(/[^a-z0-9]/g, "");
  return options.find(
    (option) =>
      option.value.toLowerCase().replace(/[^a-z0-9]/g, "") === slug ||
      option.label.toLowerCase().replace(/[^a-z0-9]/g, "") === slug,
  )?.value;
}

function multiselectParts(raw: string | string[]): string[] {
  let parts: string[];
  if (Array.isArray(raw)) {
    parts = raw;
  } else {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        parts =
          Array.isArray(parsed) &&
          parsed.every((value) => typeof value === "string")
            ? parsed
            : [];
      } catch {
        parts = [];
      }
    } else {
      parts = trimmed.split(/[,;\n]+/);
    }
  }
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function invalidValue(
  context: PipelineContext,
  fieldId: string,
  detail?: string,
): PipelineResult<never> {
  return {
    ok: false,
    event: {
      type: "dropped",
      fillId: context.fillId,
      fieldId,
      reason: "invalid_value",
      detail,
    },
  };
}

export function coerceItem(
  item: ValidatedItem,
  context: PipelineContext,
): PipelineResult<CoercedItem> {
  if (item.kind === "flag" || item.kind === "no_evidence") {
    return { ok: true, value: item };
  }
  const field = context.fieldsById.get(item.fieldId);
  if (!field) {
    return {
      ok: false,
      event: {
        type: "dropped",
        fillId: context.fillId,
        fieldId: item.fieldId,
        reason: "unknown_field",
      },
    };
  }

  if (item.kind === "proposal") {
    const raw = Array.isArray(item.raw) ? item.raw.join(", ") : item.raw;
    let normalized: NormalizedValue | null;
    if (field.type === "select") {
      const value = optionValue(raw, field.options ?? []);
      normalized = value === undefined ? null : { value };
    } else if (field.type === "multiselect") {
      const values: string[] = [];
      for (const part of multiselectParts(item.raw)) {
        const value = optionValue(part, field.options ?? []);
        if (value !== undefined && !values.includes(value)) values.push(value);
      }
      if (values.length === 0) {
        return invalidValue(context, item.fieldId, "no known options");
      }
      normalized = { value: values };
    } else if (field.type === "phone") {
      const value = normalizePhone(raw, { defaultCountry: "US" });
      normalized = value === null ? null : { value };
    } else {
      normalized = normalizeValue(field, raw, { today: context.today });
    }
    if (!normalized) {
      return invalidValue(context, item.fieldId);
    }
    const issue = validateField(field, normalized.value)[0];
    if (issue) {
      return invalidValue(context, item.fieldId, issue.message);
    }
    return {
      ok: true,
      value: {
        ...item,
        raw,
        value: normalized.value,
        ...(normalized.explanation
          ? {
              normalization: {
                raw,
                explanation: normalized.explanation,
              },
            }
          : {}),
      },
    };
  }

  const options: Array<{
    label: string;
    value: FieldValue;
    quote?: string;
    sourceId?: string;
  }> = [];
  for (const option of item.options) {
    const normalized = normalizeValue(field, option.value, {
      today: context.today,
    });
    if (!normalized) {
      return invalidValue(context, item.fieldId, "invalid question option");
    }
    const issue = validateField(field, normalized.value)[0];
    if (issue) {
      return invalidValue(context, item.fieldId, issue.message);
    }
    options.push({ ...option, value: normalized.value });
  }
  return { ok: true, value: { ...item, options } };
}
