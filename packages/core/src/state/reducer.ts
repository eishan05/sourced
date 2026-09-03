import type {
  FieldValue,
  FormDefinition,
  SerializedFieldDefinition,
  SerializedFormDefinition,
} from "../definition";
import {
  fieldById,
  fieldsOf,
  isFieldVisible,
  policyOf,
  serializeForm,
  validateField,
} from "../definition";
import { suspiciousIssues } from "../normalize/suspicious";
import type { FormEvent } from "./events";
import { submitBlockers, values } from "./selectors";
import type {
  FieldState,
  FillRun,
  FormState,
  Proposal,
  Provenance,
  Question,
} from "./types";

function emptyFieldState(): FieldState {
  return {
    value: null,
    provenance: null,
    reviewStatus: "none",
    suggestion: null,
    question: null,
    previous: null,
    issues: [],
  };
}

function issuesForValue(
  field: SerializedFieldDefinition,
  value: FieldValue,
): FieldState["issues"] {
  return [...validateField(field, value), ...suspiciousIssues(field, value)];
}

export function createInitialState(
  definition: FormDefinition | SerializedFormDefinition,
  initialValues: Record<string, FieldValue> = {},
): FormState {
  const serialized = serializeForm(definition as FormDefinition);
  const knownFieldIds = new Set(fieldsOf(serialized).map((field) => field.id));

  for (const fieldId of Object.keys(initialValues)) {
    if (!knownFieldIds.has(fieldId)) {
      throw new Error(`Unknown initial value field id "${fieldId}"`);
    }
  }

  const fields: Record<string, FieldState> = {};
  for (const field of fieldsOf(serialized)) {
    if (Object.hasOwn(initialValues, field.id)) {
      const value = initialValues[field.id] as FieldValue;
      fields[field.id] = {
        ...emptyFieldState(),
        value,
        provenance: { kind: "prefill" },
        issues: issuesForValue(field, value),
      };
    } else {
      fields[field.id] = emptyFieldState();
    }
  }

  return {
    definition: serialized,
    sources: {},
    fields,
    fills: {},
    activeFillId: null,
    flags: [],
    review: { active: false, order: [], cursor: 0 },
    submit: { status: "idle" },
  };
}

function updateField(
  state: FormState,
  fieldId: string,
  update: (field: FieldState) => FieldState,
): FormState {
  const field = state.fields[fieldId];
  const definition = fieldById(state.definition, fieldId);
  if (!field || !definition) {
    return state;
  }

  let nextField = update(field);
  if (nextField === field) {
    return state;
  }
  if (nextField.value !== field.value) {
    nextField = {
      ...nextField,
      issues: issuesForValue(definition, nextField.value),
    };
  }
  return {
    ...state,
    fields: { ...state.fields, [fieldId]: nextField },
  };
}

function updateFill(
  state: FormState,
  fillId: string,
  update: (fill: FillRun) => FillRun,
): FormState {
  const fill = state.fills[fillId];
  if (!fill) {
    return state;
  }
  const nextFill = update(fill);
  if (nextFill === fill) {
    return state;
  }
  return { ...state, fills: { ...state.fills, [fillId]: nextFill } };
}

function incrementFillCount(
  state: FormState,
  fillId: string,
  count: keyof FillRun["counts"],
): FormState {
  return updateFill(state, fillId, (fill) => ({
    ...fill,
    counts: { ...fill.counts, [count]: fill.counts[count] + 1 },
  }));
}

function proposalProvenance(proposal: Proposal): Provenance {
  return {
    kind: proposal.kind,
    ...(proposal.span ? { span: proposal.span } : {}),
    proposalId: proposal.id,
    ...(proposal.normalization
      ? { normalization: proposal.normalization }
      : {}),
  };
}

function acceptedSuggestionProvenance(proposal: Proposal): Provenance {
  return {
    kind: "inferred",
    proposalId: proposal.id,
    ...(proposal.normalization
      ? { normalization: proposal.normalization }
      : {}),
  };
}

function isHumanDecision(field: FieldState): boolean {
  return (
    field.reviewStatus === "accepted" ||
    field.reviewStatus === "overridden" ||
    field.provenance?.kind === "user" ||
    field.provenance?.kind === "answered"
  );
}

function isClearValue(value: FieldValue): boolean {
  return (
    value === null ||
    (typeof value === "string" && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0)
  );
}

function shouldSnapshot(field: FieldState): boolean {
  return (
    field.provenance?.kind === "extracted" ||
    field.provenance?.kind === "inferred" ||
    field.provenance?.kind === "answered"
  );
}

function applyUserValue(
  field: FieldState,
  value: FieldValue,
  span?: Provenance["span"],
): FieldState {
  const previous =
    shouldSnapshot(field) && !field.previous
      ? { value: field.value, provenance: field.provenance }
      : field.previous;

  if (isClearValue(value)) {
    return {
      ...field,
      value: null,
      provenance: null,
      reviewStatus: "none",
      suggestion: null,
      question: null,
      previous,
    };
  }

  return {
    ...field,
    value,
    provenance: { kind: "user", ...(span ? { span } : {}) },
    reviewStatus: "overridden",
    suggestion: null,
    question: null,
    previous,
  };
}

function statusForProvenance(
  provenance: Provenance | null,
): FieldState["reviewStatus"] {
  switch (provenance?.kind) {
    case "extracted":
    case "inferred":
      return "pending";
    case "user":
      return "overridden";
    case "answered":
      return "accepted";
    case "prefill":
    case undefined:
      return "none";
  }
}

function removeSourceFromProvenance(
  provenance: Provenance | null,
  sourceId: string,
): Provenance | null {
  if (provenance?.span?.sourceId !== sourceId) {
    return provenance;
  }
  const { span: _span, ...withoutSpan } = provenance;
  return withoutSpan;
}

function removeSourceFromProposal(
  proposal: Proposal | null,
  sourceId: string,
): Proposal | null {
  if (proposal?.span?.sourceId !== sourceId) {
    return proposal;
  }
  return { ...proposal, span: null };
}

function removeSourceFromQuestion(
  question: Question | null,
  sourceId: string,
): Question | null {
  if (!question) {
    return null;
  }
  let changed = false;
  const options = question.options.map((option) => {
    if (option.span?.sourceId !== sourceId) {
      return option;
    }
    changed = true;
    const { span: _span, ...withoutSpan } = option;
    return withoutSpan;
  });
  return changed ? { ...question, options } : question;
}

function removeSourceSpans(state: FormState, sourceId: string): FormState {
  let fieldsChanged = false;
  const fields = Object.fromEntries(
    Object.entries(state.fields).map(([fieldId, field]) => {
      const provenance = removeSourceFromProvenance(field.provenance, sourceId);
      const suggestion = removeSourceFromProposal(field.suggestion, sourceId);
      const question = removeSourceFromQuestion(field.question, sourceId);
      const previousProvenance = removeSourceFromProvenance(
        field.previous?.provenance ?? null,
        sourceId,
      );
      const previous =
        field.previous && previousProvenance !== field.previous.provenance
          ? { ...field.previous, provenance: previousProvenance }
          : field.previous;

      if (
        provenance === field.provenance &&
        suggestion === field.suggestion &&
        question === field.question &&
        previous === field.previous
      ) {
        return [fieldId, field];
      }
      fieldsChanged = true;
      return [
        fieldId,
        { ...field, provenance, suggestion, question, previous },
      ];
    }),
  );

  const sourceExists = Object.hasOwn(state.sources, sourceId);
  if (!sourceExists && !fieldsChanged) {
    return state;
  }
  const sources = { ...state.sources };
  delete sources[sourceId];
  return { ...state, sources, ...(fieldsChanged ? { fields } : {}) };
}

function clearAiField(field: FieldState): FieldState {
  const hasAiValue =
    field.provenance?.kind === "extracted" ||
    field.provenance?.kind === "inferred";
  if (!hasAiValue && !field.suggestion && !field.question) {
    return field;
  }
  return {
    ...field,
    ...(hasAiValue
      ? {
          value: null,
          provenance: null,
          reviewStatus: "none" as const,
          previous: null,
        }
      : {}),
    suggestion: null,
    question: null,
  };
}

function clearAllAi(state: FormState): FormState {
  let fieldsChanged = false;
  let fields = state.fields;

  for (const fieldId of Object.keys(state.fields)) {
    const nextState = updateField({ ...state, fields }, fieldId, clearAiField);
    if (nextState.fields !== fields) {
      fieldsChanged = true;
      fields = nextState.fields;
    }
  }

  const reviewChanged = state.review.active;
  if (!fieldsChanged && state.flags.length === 0 && !reviewChanged) {
    return state;
  }
  return {
    ...state,
    fields,
    flags: [],
    review: reviewChanged ? { ...state.review, active: false } : state.review,
  };
}

function extendReviewOrder(state: FormState): FormState {
  if (!state.review.active) {
    return state;
  }

  const currentValues = values(state);
  const currentFieldId = state.review.order[state.review.cursor];
  const included = new Set(state.review.order);
  let changed = false;

  for (const definition of fieldsOf(state.definition)) {
    const field = state.fields[definition.id];
    if (
      !included.has(definition.id) &&
      field &&
      isFieldVisible(state.definition, definition.id, currentValues) &&
      (field.reviewStatus === "pending" ||
        field.suggestion !== null ||
        field.question !== null)
    ) {
      included.add(definition.id);
      changed = true;
    }
  }

  if (!changed) {
    return state;
  }

  const order = fieldsOf(state.definition)
    .filter((definition) => included.has(definition.id))
    .map((definition) => definition.id);
  const cursor = currentFieldId
    ? order.indexOf(currentFieldId)
    : state.review.cursor;

  return {
    ...state,
    review: { ...state.review, order, cursor },
  };
}

function moveReviewForward(state: FormState): FormState {
  const extended = extendReviewOrder(state);
  if (!extended.review.active) {
    return extended;
  }
  const currentValues = values(extended);
  for (
    let cursor = extended.review.cursor + 1;
    cursor < extended.review.order.length;
    cursor += 1
  ) {
    const fieldId = extended.review.order[cursor];
    if (
      fieldId &&
      isFieldVisible(extended.definition, fieldId, currentValues)
    ) {
      return { ...extended, review: { ...extended.review, cursor } };
    }
  }
  return {
    ...extended,
    review: {
      ...extended.review,
      active: false,
      cursor: extended.review.order.length,
    },
  };
}

export function reduce(state: FormState, event: FormEvent): FormState {
  switch (event.type) {
    case "SOURCE_ADDED": {
      if (state.sources[event.source.id] === event.source) {
        return state;
      }
      return {
        ...state,
        sources: { ...state.sources, [event.source.id]: event.source },
      };
    }
    case "SOURCE_REMOVED":
      return removeSourceSpans(state, event.sourceId);
    case "FILL_STARTED":
      return {
        ...state,
        fills: {
          ...state.fills,
          [event.fillId]: {
            id: event.fillId,
            status: "streaming",
            sourceIds: event.sourceIds,
            counts: { proposals: 0, questions: 0, flags: 0 },
            noEvidenceFieldIds: [],
          },
        },
        activeFillId: event.fillId,
      };
    case "FILL_FINISHED": {
      const fill = state.fills[event.fillId];
      if (!fill) {
        return state;
      }
      const activeFillId =
        state.activeFillId === event.fillId ? null : state.activeFillId;
      if (fill.status === "done" && activeFillId === state.activeFillId) {
        return state;
      }
      const { error: _error, ...withoutError } = fill;
      return {
        ...state,
        fills: {
          ...state.fills,
          [event.fillId]: { ...withoutError, status: "done" },
        },
        activeFillId,
      };
    }
    case "FILL_FAILED": {
      const fill = state.fills[event.fillId];
      if (!fill) {
        return state;
      }
      if (
        fill.status === "error" &&
        fill.error === event.error &&
        state.activeFillId === null
      ) {
        return state;
      }
      return {
        ...state,
        fills: {
          ...state.fills,
          [event.fillId]: {
            ...fill,
            status: "error",
            error: event.error,
          },
        },
        activeFillId: null,
      };
    }
    case "PROPOSAL_RECEIVED": {
      const { proposal } = event;
      const definition = fieldById(state.definition, proposal.fieldId);
      if (
        !definition ||
        policyOf(definition) === "human" ||
        !state.fills[proposal.fillId]
      ) {
        return state;
      }
      const counted = incrementFillCount(state, proposal.fillId, "proposals");
      return updateField(counted, proposal.fieldId, (field) => {
        if (isHumanDecision(field) || proposal.kind === "inferred") {
          return { ...field, suggestion: proposal };
        }
        return {
          ...field,
          value: proposal.value,
          provenance: proposalProvenance(proposal),
          reviewStatus: "pending",
          suggestion: null,
        };
      });
    }
    case "QUESTION_RECEIVED": {
      const { question } = event;
      const definition = fieldById(state.definition, question.fieldId);
      const field = state.fields[question.fieldId];
      if (
        !definition ||
        !field ||
        policyOf(definition) === "human" ||
        field.reviewStatus === "accepted" ||
        field.reviewStatus === "overridden"
      ) {
        return state;
      }
      const withQuestion = updateField(state, question.fieldId, (current) => ({
        ...current,
        question,
      }));
      return incrementFillCount(withQuestion, question.fillId, "questions");
    }
    case "FLAG_RECEIVED": {
      const { flag } = event;
      if (
        state.flags.some((existing) => existing.id === flag.id) ||
        flag.fieldIds.some((fieldId) => !state.fields[fieldId])
      ) {
        return state;
      }
      const withFlag = { ...state, flags: [...state.flags, flag] };
      return incrementFillCount(withFlag, flag.fillId, "flags");
    }
    case "NO_EVIDENCE": {
      if (!state.fields[event.fieldId]) {
        return state;
      }
      return updateFill(state, event.fillId, (fill) => {
        if (fill.noEvidenceFieldIds.includes(event.fieldId)) {
          return fill;
        }
        return {
          ...fill,
          noEvidenceFieldIds: [...fill.noEvidenceFieldIds, event.fieldId],
        };
      });
    }
    case "ACCEPT":
      return updateField(state, event.fieldId, (field) => {
        if (field.suggestion) {
          return {
            ...field,
            value: field.suggestion.value,
            provenance: acceptedSuggestionProvenance(field.suggestion),
            reviewStatus: "accepted",
            suggestion: null,
            previous:
              field.value !== null
                ? { value: field.value, provenance: field.provenance }
                : field.previous,
          };
        }
        if (field.reviewStatus === "pending") {
          return { ...field, reviewStatus: "accepted" };
        }
        return field;
      });
    case "OVERRIDE":
      return updateField(state, event.fieldId, (field) =>
        applyUserValue(field, event.value),
      );
    case "ANSWER":
      return updateField(state, event.fieldId, (field) => {
        if (!field.question) {
          return field;
        }
        const span =
          event.optionIndex === undefined
            ? undefined
            : field.question.options[event.optionIndex]?.span;
        return {
          ...field,
          value: event.value,
          provenance: {
            kind: "answered",
            questionId: field.question.id,
            ...(span ? { span } : {}),
          },
          reviewStatus: "accepted",
          question: null,
          suggestion: null,
        };
      });
    case "DISMISS_SUGGESTION":
      return updateField(state, event.fieldId, (field) =>
        field.suggestion ? { ...field, suggestion: null } : field,
      );
    case "REVERT":
      return updateField(state, event.fieldId, (field) => {
        if (!field.previous) {
          if (
            field.value === null &&
            field.provenance === null &&
            field.reviewStatus === "none"
          ) {
            return field;
          }
          return {
            ...field,
            value: null,
            provenance: null,
            reviewStatus: "none",
          };
        }
        return {
          ...field,
          value: field.previous.value,
          provenance: field.previous.provenance,
          reviewStatus: statusForProvenance(field.previous.provenance),
          previous: null,
        };
      });
    case "USE_SELECTION":
      return updateField(state, event.fieldId, (field) =>
        applyUserValue(field, event.value, event.span),
      );
    case "CLEAR_AI":
      if (event.fieldId !== undefined) {
        return updateField(state, event.fieldId, clearAiField);
      }
      return clearAllAi(state);
    case "ACKNOWLEDGE_FLAG": {
      const index = state.flags.findIndex((flag) => flag.id === event.flagId);
      if (index < 0 || state.flags[index]?.acknowledged) {
        return state;
      }
      return {
        ...state,
        flags: state.flags.map((flag, flagIndex) =>
          flagIndex === index ? { ...flag, acknowledged: true } : flag,
        ),
      };
    }
    case "REVIEW_START": {
      const currentValues = values(state);
      const order = fieldsOf(state.definition)
        .filter((field) => {
          const fieldState = state.fields[field.id];
          return (
            fieldState &&
            isFieldVisible(state.definition, field.id, currentValues) &&
            (fieldState.reviewStatus === "pending" ||
              fieldState.suggestion !== null ||
              fieldState.question !== null)
          );
        })
        .map((field) => field.id);
      return {
        ...state,
        review: { active: order.length > 0, order, cursor: 0 },
      };
    }
    case "REVIEW_NEXT":
    case "REVIEW_SKIP":
      return moveReviewForward(state);
    case "REVIEW_PREV": {
      if (!state.review.active || state.review.cursor === 0) {
        return state;
      }
      const currentValues = values(state);
      for (let cursor = state.review.cursor - 1; cursor >= 0; cursor -= 1) {
        const fieldId = state.review.order[cursor];
        if (
          fieldId &&
          isFieldVisible(state.definition, fieldId, currentValues)
        ) {
          return { ...state, review: { ...state.review, cursor } };
        }
      }
      return state;
    }
    case "REVIEW_GOTO": {
      if (!state.fields[event.fieldId]) {
        return state;
      }
      const cursor = state.review.order.indexOf(event.fieldId);
      if (cursor < 0 || cursor === state.review.cursor) {
        return state;
      }
      return { ...state, review: { ...state.review, cursor } };
    }
    case "REVIEW_END":
      return state.review.active
        ? { ...state, review: { ...state.review, active: false } }
        : state;
    case "SUBMIT_REQUESTED":
      if (
        submitBlockers(state).length > 0 ||
        state.submit.status === "submitting"
      ) {
        return state;
      }
      return { ...state, submit: { status: "submitting" } };
    case "SUBMIT_SUCCEEDED":
      return state.submit.status === "submitted" && !state.submit.error
        ? state
        : { ...state, submit: { status: "submitted" } };
    case "SUBMIT_FAILED":
      return state.submit.status === "failed" &&
        state.submit.error === event.error
        ? state
        : { ...state, submit: { status: "failed", error: event.error } };
    case "RESET":
      return createInitialState(state.definition);
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
