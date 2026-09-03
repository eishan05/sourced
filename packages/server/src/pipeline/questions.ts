import type { FillEvent, Question } from "@ai-native-forms/core";

import { locateModelQuote } from "./locate";
import type { PipelineContext, PipelineResult, QuestionDraft } from "./types";

export function finalizeQuestion(
  item: QuestionDraft,
  context: PipelineContext,
  questionCount: number,
  maxQuestions = 5,
): PipelineResult<FillEvent> {
  if (questionCount >= maxQuestions) {
    return {
      ok: false,
      event: {
        type: "dropped",
        fillId: context.fillId,
        fieldId: item.fieldId,
        reason: "malformed",
        detail: "question limit",
      },
    };
  }

  const question: Question = {
    id: context.idGen(),
    fillId: context.fillId,
    fieldId: item.fieldId,
    text: item.question,
    options: item.options.map((option) => {
      const located = locateModelQuote(
        option.quote,
        option.sourceId,
        context.sources,
      );
      return {
        label: option.label,
        value: option.value,
        ...(located.span ? { span: located.span } : {}),
      };
    }),
    allowFreeText: item.allowFreeText,
  };
  return { ok: true, value: { type: "question", question } };
}
