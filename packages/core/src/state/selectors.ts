import type { Condition, FieldValue } from "../definition";
import {
  evaluateCondition,
  fieldById,
  fieldsOf,
  isFieldVisible,
} from "../definition";
import type { FormState, Provenance, Span } from "./types";

export interface HiddenReason {
  gateFieldId: string;
  gateLabel: string;
  gateValue: FieldValue;
}

export interface SubmitBlocker {
  reason: "unreviewed" | "unanswered" | "invalid" | "required" | "flag";
  fieldId?: string;
  flagId?: string;
}

export interface SubmitSummary {
  extracted: number;
  inferred: number;
  answered: number;
  user: number;
  prefill: number;
  total: number;
  bySource: Record<string, number>;
}

export interface SourceHighlight {
  span: Span;
  fieldId: string;
  kind: "extracted" | "inferred" | "option" | "user";
}

export function values(state: FormState): Record<string, FieldValue> {
  return Object.fromEntries(
    Object.entries(state.fields).map(([fieldId, field]) => [
      fieldId,
      field.value,
    ]),
  );
}

export function isVisible(state: FormState, fieldId: string): boolean {
  return isFieldVisible(state.definition, fieldId, values(state));
}

export function visibleFieldIds(state: FormState): string[] {
  const currentValues = values(state);
  return fieldsOf(state.definition)
    .filter((field) =>
      isFieldVisible(state.definition, field.id, currentValues),
    )
    .map((field) => field.id);
}

function firstFailingLeaf(
  condition: Condition,
  currentValues: Record<string, FieldValue>,
): Extract<Condition, { field: string }> | null {
  if (evaluateCondition(condition, currentValues)) {
    return null;
  }
  if ("field" in condition) {
    return condition;
  }

  const children = "all" in condition ? condition.all : condition.any;
  for (const child of children) {
    const leaf = firstFailingLeaf(child, currentValues);
    if (leaf) {
      return leaf;
    }
  }
  return null;
}

function reasonForCondition(
  state: FormState,
  condition: Condition | undefined,
  currentValues: Record<string, FieldValue>,
): HiddenReason | null {
  if (!condition) {
    return null;
  }
  const leaf = firstFailingLeaf(condition, currentValues);
  if (!leaf) {
    return null;
  }
  const gate = fieldById(state.definition, leaf.field);
  return {
    gateFieldId: leaf.field,
    gateLabel: gate?.label ?? leaf.field,
    gateValue: currentValues[leaf.field] ?? null,
  };
}

export function hiddenReason(
  state: FormState,
  sectionIdOrFieldId: string,
): HiddenReason | null {
  const currentValues = values(state);

  for (const section of state.definition.sections) {
    if (section.id === sectionIdOrFieldId) {
      return reasonForCondition(state, section.showWhen, currentValues);
    }

    const field = section.fields.find(
      (candidate) => candidate.id === sectionIdOrFieldId,
    );
    if (field) {
      return (
        reasonForCondition(state, section.showWhen, currentValues) ??
        reasonForCondition(state, field.showWhen, currentValues)
      );
    }
  }

  return null;
}

export function unreviewedAiFieldIds(state: FormState): string[] {
  const visible = new Set(visibleFieldIds(state));
  return fieldsOf(state.definition)
    .filter(
      (field) =>
        visible.has(field.id) &&
        state.fields[field.id]?.reviewStatus === "pending",
    )
    .map((field) => field.id);
}

function isEmpty(value: FieldValue): boolean {
  return (
    value === null ||
    (typeof value === "string" && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function submitBlockers(state: FormState): SubmitBlocker[] {
  const blockers: SubmitBlocker[] = [];
  const visible = new Set(visibleFieldIds(state));

  for (const definition of fieldsOf(state.definition)) {
    if (!visible.has(definition.id)) {
      continue;
    }
    const field = state.fields[definition.id];
    if (!field) {
      continue;
    }
    if (field.reviewStatus === "pending") {
      blockers.push({ reason: "unreviewed", fieldId: definition.id });
    }
    if (field.question) {
      blockers.push({ reason: "unanswered", fieldId: definition.id });
    }
    if (definition.required && isEmpty(field.value)) {
      blockers.push({ reason: "required", fieldId: definition.id });
    }
    if (
      field.issues.some(
        (issue) => issue.severity === "error" && issue.code !== "required",
      )
    ) {
      blockers.push({ reason: "invalid", fieldId: definition.id });
    }
  }

  for (const flag of state.flags) {
    if (
      flag.severity === "error" &&
      !flag.acknowledged &&
      flag.fieldIds.some((fieldId) => visible.has(fieldId))
    ) {
      blockers.push({ reason: "flag", flagId: flag.id });
    }
  }

  return blockers;
}

export function submitSummary(state: FormState): SubmitSummary {
  const summary: SubmitSummary = {
    extracted: 0,
    inferred: 0,
    answered: 0,
    user: 0,
    prefill: 0,
    total: 0,
    bySource: {},
  };
  const visible = new Set(visibleFieldIds(state));

  for (const [fieldId, field] of Object.entries(state.fields)) {
    if (!visible.has(fieldId) || field.value === null || !field.provenance) {
      continue;
    }
    summary[field.provenance.kind] += 1;
    summary.total += 1;

    const sourceId = field.provenance.span?.sourceId;
    const sourceName = sourceId ? state.sources[sourceId]?.name : undefined;
    if (sourceName) {
      summary.bySource[sourceName] = (summary.bySource[sourceName] ?? 0) + 1;
    }
  }

  return summary;
}

function provenanceHighlightKind(
  provenance: Provenance,
): SourceHighlight["kind"] | null {
  switch (provenance.kind) {
    case "extracted":
      return "extracted";
    case "inferred":
      return "inferred";
    case "answered":
      return "option";
    case "user":
      return "user";
    case "prefill":
      return null;
  }
}

export function highlightsForSource(
  state: FormState,
  sourceId: string,
): SourceHighlight[] {
  const highlights: SourceHighlight[] = [];

  for (const [fieldId, field] of Object.entries(state.fields)) {
    const provenanceKind = field.provenance
      ? provenanceHighlightKind(field.provenance)
      : null;
    if (provenanceKind && field.provenance?.span?.sourceId === sourceId) {
      highlights.push({
        span: field.provenance.span,
        fieldId,
        kind: provenanceKind,
      });
    }

    if (field.suggestion?.span?.sourceId === sourceId) {
      highlights.push({
        span: field.suggestion.span,
        fieldId,
        kind: field.suggestion.kind,
      });
    }

    for (const option of field.question?.options ?? []) {
      if (option.span?.sourceId === sourceId) {
        highlights.push({ span: option.span, fieldId, kind: "option" });
      }
    }
  }

  return highlights.sort((left, right) => left.span.start - right.span.start);
}

export function reviewCursorFieldId(state: FormState): string | null {
  if (!state.review.active) {
    return null;
  }
  return state.review.order[state.review.cursor] ?? null;
}

export function fieldsUsingSource(
  state: FormState,
  sourceId: string,
): string[] {
  const highlighted = new Set(
    highlightsForSource(state, sourceId).map((highlight) => highlight.fieldId),
  );
  return fieldsOf(state.definition)
    .map((field) => field.id)
    .filter((fieldId) => highlighted.has(fieldId));
}
