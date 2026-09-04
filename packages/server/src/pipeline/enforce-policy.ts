import {
  type FieldValue,
  normalizeTextForQuoteLocation,
  policyOf,
} from "@sourced/core";

import type {
  EnforcedItem,
  LocatedItem,
  PipelineContext,
  PipelineResult,
} from "./types";

const TEXT_TYPES = new Set(["text", "textarea"]);

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

function extractedValueMatchesQuote(
  fieldType: string,
  value: FieldValue,
  quote: string,
): boolean {
  if (fieldType === "phone") {
    const valueDigits = String(value).replace(/\D/g, "");
    const quoteDigits = quote.replace(/\D/g, "");
    return valueDigits.length > 0 && quoteDigits.includes(valueDigits);
  }
  if (fieldType === "email") {
    return String(value).trim().toLowerCase() === quote.trim().toLowerCase();
  }
  if (TEXT_TYPES.has(fieldType)) {
    const normalizedValue = normalizeTextForQuoteLocation(String(value)).text;
    const normalizedQuote = normalizeTextForQuoteLocation(quote).text;
    return normalizedQuote.includes(normalizedValue);
  }
  return true;
}

function evidenceFor(item: LocatedItem & { kind: "proposal" }) {
  return item.span
    ? { sourceId: item.span.sourceId, quote: item.span.quote }
    : {};
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
  } else if (
    basis === "extracted" &&
    item.span &&
    !extractedValueMatchesQuote(field.type, item.value, item.span.quote)
  ) {
    basis = "inferred";
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
    const evidence = evidenceFor(item);
    if (field.type === "boolean") {
      return {
        ok: true,
        value: {
          kind: "question",
          fieldId: item.fieldId,
          question: `I read "${field.label}" as ${item.value === true ? "Yes" : "No"}, but couldn't find it stated verbatim. Is that right?`,
          options: [
            {
              label: "Yes",
              value: true,
              ...(item.value === true ? evidence : {}),
            },
            {
              label: "No",
              value: false,
              ...(item.value === false ? evidence : {}),
            },
          ],
          allowFreeText: false,
        },
      };
    }
    if (field.type === "select") {
      const matched = field.options?.find(
        (option) => option.value === item.value,
      );
      const label = matched?.label ?? displayed;
      return {
        ok: true,
        value: {
          kind: "question",
          fieldId: item.fieldId,
          question: `I read "${field.label}" as ${label}, but couldn't find it stated verbatim. Is that right?`,
          options: [
            { label, value: item.value, ...evidence },
            { label: "Something else", value: "" },
          ],
          allowFreeText: true,
        },
      };
    }
    return {
      ok: true,
      value: {
        kind: "question",
        fieldId: item.fieldId,
        question: `I read "${field.label}" as ${displayed}, but couldn't find it stated verbatim. Is that right?`,
        options: [{ label: displayed, value: item.value, ...evidence }],
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
