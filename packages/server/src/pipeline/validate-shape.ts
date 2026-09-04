import { type FillEvent, policyOf } from "@sourced/core";

import type { FillItem } from "../schema";
import type { PipelineContext, PipelineResult, ValidatedItem } from "./types";

function dropped(
  context: PipelineContext,
  reason: Extract<FillEvent, { type: "dropped" }>["reason"],
  fieldId?: string,
  detail?: string,
): PipelineResult<never> {
  return {
    ok: false,
    event: {
      type: "dropped",
      fillId: context.fillId,
      fieldId,
      reason,
      detail,
    },
  };
}

function validateField(
  fieldId: string | undefined,
  context: PipelineContext,
): PipelineResult<string> {
  if (!fieldId) {
    return dropped(context, "malformed", undefined, "missing fieldId");
  }
  const field = context.fieldsById.get(fieldId);
  if (!field) {
    return dropped(context, "unknown_field", fieldId);
  }
  if (policyOf(field) === "human") {
    return dropped(context, "policy_human", fieldId);
  }
  return { ok: true, value: fieldId };
}

export function validateShape(
  item: FillItem,
  context: PipelineContext,
): PipelineResult<ValidatedItem> {
  if (item.kind === "flag") {
    if (
      !item.fieldIds ||
      item.fieldIds.length === 0 ||
      !item.message?.trim() ||
      !item.severity
    ) {
      return dropped(context, "malformed", undefined, "invalid flag");
    }
    const unknownId = item.fieldIds.find(
      (fieldId) => !context.fieldsById.has(fieldId),
    );
    if (unknownId) {
      return dropped(context, "unknown_field", unknownId);
    }
    const humanId = item.fieldIds.find((fieldId) => {
      const field = context.fieldsById.get(fieldId);
      return field ? policyOf(field) === "human" : false;
    });
    if (humanId) {
      return dropped(context, "policy_human", humanId);
    }
    return {
      ok: true,
      value: {
        kind: "flag",
        fieldIds: item.fieldIds,
        message: item.message.trim(),
        severity: item.severity,
      },
    };
  }

  const fieldResult = validateField(item.fieldId, context);
  if (!fieldResult.ok) {
    return fieldResult;
  }
  const fieldId = fieldResult.value;
  const field = context.fieldsById.get(fieldId);
  if (!field) {
    return dropped(context, "unknown_field", fieldId);
  }

  if (item.kind === "no_evidence") {
    return { ok: true, value: { kind: "no_evidence", fieldId } };
  }

  if (item.kind === "proposal") {
    if (
      item.value !== undefined &&
      (item.value.trim() === "" ||
        item.value.trim().toLowerCase() === "no_evidence")
    ) {
      return { ok: true, value: { kind: "no_evidence", fieldId } };
    }
    const raw =
      field.type === "multiselect" ? (item.values ?? item.value) : item.value;
    if (!item.basis || raw === undefined) {
      return dropped(context, "malformed", fieldId, "invalid proposal");
    }
    return {
      ok: true,
      value: {
        kind: "proposal",
        fieldId,
        basis: item.basis,
        raw,
        sourceId: item.sourceId,
        quote: item.quote,
        rationale: item.rationale,
      },
    };
  }

  if (!item.question?.trim()) {
    return dropped(context, "malformed", fieldId, "invalid question");
  }
  return {
    ok: true,
    value: {
      kind: "question",
      fieldId,
      question: item.question.trim(),
      options: item.options ?? [],
      allowFreeText: item.allowFreeText ?? true,
    },
  };
}
