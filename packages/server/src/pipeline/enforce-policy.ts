import {
  type FieldValue,
  normalizeTextForQuoteLocation,
  policyOf,
} from "@ai-native-forms/core";

import type {
  EnforcedItem,
  LocatedItem,
  PipelineContext,
  PipelineResult,
} from "./types";

const TEXT_TYPES = new Set(["text", "textarea", "email", "phone"]);

function displayValue(value: FieldValue): string {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

function isEmpty(value: FieldValue): boolean {
  return (
    value === null ||
    (typeof value === "string" && value.length === 0) ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function enforcePolicy(
  item: LocatedItem,
  context: PipelineContext,
): PipelineResult<EnforcedItem> {
  if (item.kind !== "proposal") {
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
  let basis = item.basis;
  if (basis === "extracted" && !item.span) {
    basis = "inferred";
  } else if (basis === "extracted" && item.span && TEXT_TYPES.has(field.type)) {
    const value = normalizeTextForQuoteLocation(String(item.value)).text;
    const quote = normalizeTextForQuoteLocation(item.span.quote).text;
    if (!quote.includes(value)) {
      basis = "inferred";
    }
  }

  if (policyOf(field) === "extract" && basis === "inferred") {
    if (isEmpty(item.value)) {
      return {
        ok: false,
        event: {
          type: "dropped",
          fillId: context.fillId,
          fieldId: item.fieldId,
          reason: "invalid_value",
          detail: "empty inferred value",
        },
      };
    }
    const displayed = displayValue(item.value);
    return {
      ok: true,
      value: {
        kind: "question",
        fieldId: item.fieldId,
        question: `Is your ${field.label} ${displayed}? I couldn't find it stated verbatim.`,
        options: [{ label: displayed, value: item.value }],
        allowFreeText: true,
      },
    };
  }

  return {
    ok: true,
    value: {
      kind: "proposal",
      fieldId: item.fieldId,
      basis,
      value: item.value,
      span: item.span,
      quote: item.quote,
      rationale: item.rationale,
      normalization: item.normalization,
    },
  };
}
