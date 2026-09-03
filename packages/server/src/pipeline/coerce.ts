import {
  type FieldValue,
  normalizeValue,
  validateField,
} from "@ai-native-forms/core";

import type {
  CoercedItem,
  PipelineContext,
  PipelineResult,
  ValidatedItem,
} from "./types";

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
    const normalized = normalizeValue(field, raw, { today: context.today });
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
