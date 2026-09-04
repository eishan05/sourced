import { normalizeValue, policyOf, type Question } from "@sourced/core";
import { useMemo, useState } from "react";

import { useAIFormApi, useField } from "../context";
import type { AIFormApi, FieldApi } from "../useAIForm";

export interface AskBackProps {
  fieldId: string;
  className?: string;
}

interface OpenAskBackProps extends AskBackProps {
  api: AIFormApi;
  field: FieldApi;
  question: Question;
}

function OpenAskBack({
  api,
  field,
  fieldId,
  className,
  question,
}: OpenAskBackProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [localHighlighted, setLocalHighlighted] = useState<number | null>(null);
  const isReviewCursor =
    api.review.active && api.review.cursorFieldId === fieldId;
  const normalized = useMemo(
    () =>
      text.length > 0
        ? normalizeValue(field.def, text, { today: api.today })
        : null,
    [api.today, field.def, text],
  );

  const highlight = (index: number): void => {
    if (isReviewCursor) {
      api.review.setHighlightedOption(index);
    } else {
      setLocalHighlighted(index);
    }
    const span = question.options[index]?.span;
    if (span) api.sources.focusSpan(span);
  };

  const answerText = (): void => {
    if (!normalized) {
      setError(`Enter a valid ${field.def.label.toLowerCase()}.`);
      return;
    }
    field.answer(normalized.value);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: The AskBack DOM contract requires a div with role=group.
    <div
      aria-labelledby={`${fieldId}-question`}
      className={className}
      data-askback
      role="group"
    >
      <p id={`${fieldId}-question`}>{question.text}</p>
      <div>
        {question.options.map((option, index) => (
          <button
            data-highlighted={
              (
                isReviewCursor
                  ? api.review.highlightedOption === index
                  : localHighlighted === index
              )
                ? "true"
                : undefined
            }
            data-option
            key={`${option.label}-${JSON.stringify(option.value)}`}
            onBlur={() => {
              if (!isReviewCursor) setLocalHighlighted(null);
            }}
            onClick={() => field.answer(option.value, index)}
            onFocus={() => highlight(index)}
            onMouseEnter={() => highlight(index)}
            onMouseLeave={() => {
              if (!isReviewCursor) setLocalHighlighted(null);
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      {question.allowFreeText ? (
        <div>
          <input
            aria-label={`Answer ${field.def.label}`}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
            type="text"
            value={text}
          />
          <button onClick={answerText} type="button">
            Use this
          </button>
          {normalized?.explanation ? (
            <small data-normalization>{normalized.explanation}</small>
          ) : null}
          {error ? (
            <small data-error role="alert">
              {error}
            </small>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AskBack({ fieldId, className }: AskBackProps) {
  const api = useAIFormApi();
  const field = useField(fieldId);
  const question = field.state.question;
  if (!question || policyOf(field.def) === "human") return null;

  return (
    <OpenAskBack
      api={api}
      className={className}
      field={field}
      fieldId={fieldId}
      key={question.id}
      question={question}
    />
  );
}
