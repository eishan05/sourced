import type { FillEvent, Proposal } from "@ai-native-forms/core";

import type { FillItem } from "../schema";
import { coerceItem } from "./coerce";
import { dedupe } from "./dedupe";
import { enforcePolicy } from "./enforce-policy";
import { finalizeFlag } from "./flags";
import { locateItem } from "./locate";
import { finalizeQuestion } from "./questions";
import type { PipelineContext } from "./types";
import { validateShape } from "./validate-shape";

export * from "./coerce";
export * from "./dedupe";
export * from "./enforce-policy";
export * from "./flags";
export * from "./locate";
export * from "./questions";
export * from "./types";
export * from "./validate-shape";

export interface PipelineState {
  questionCount: number;
  proposalsByField: ReadonlyMap<string, Proposal>;
}

export function runPipeline(
  item: FillItem,
  context: PipelineContext,
  state: PipelineState,
  maxQuestions = 5,
): { events: FillEvent[]; state: PipelineState } {
  const validated = validateShape(item, context);
  if (!validated.ok) {
    return { events: [validated.event], state };
  }
  const coerced = coerceItem(validated.value, context);
  if (!coerced.ok) {
    return { events: [coerced.event], state };
  }
  const located = locateItem(coerced.value, context);
  if (!located.ok) {
    return { events: [located.event], state };
  }
  const enforced = enforcePolicy(located.value, context);
  if (!enforced.ok) {
    return { events: [enforced.event], state };
  }

  const value = enforced.value;
  let event: FillEvent;
  let questionCount = state.questionCount;
  if (value.kind === "proposal") {
    event = {
      type: "proposal",
      proposal: {
        id: context.idGen(),
        fillId: context.fillId,
        fieldId: value.fieldId,
        kind: value.basis,
        value: value.value,
        span: value.span,
        quote: value.quote,
        rationale: value.rationale,
        normalization: value.normalization,
      },
    };
  } else if (value.kind === "question") {
    const finalized = finalizeQuestion(
      value,
      context,
      state.questionCount,
      maxQuestions,
    );
    if (!finalized.ok) {
      return { events: [finalized.event], state };
    }
    event = finalized.value;
    questionCount += 1;
  } else if (value.kind === "flag") {
    event = finalizeFlag(value, context);
  } else {
    event = {
      type: "no_evidence",
      fillId: context.fillId,
      fieldId: value.fieldId,
    };
  }

  const deduped = dedupe(event, state.proposalsByField);
  return {
    events: [deduped.event],
    state: { questionCount, proposalsByField: deduped.proposalsByField },
  };
}
