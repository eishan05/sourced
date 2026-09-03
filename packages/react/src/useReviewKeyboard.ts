import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
} from "react";

import type { AIFormApi } from "./useAIForm";

export interface UseReviewKeyboardOptions {
  enabled?: boolean;
}

export interface ReviewKeyboardState {
  highlightedOption: number;
  setHighlightedOption: Dispatch<SetStateAction<number>>;
}

export function useReviewKeyboard(
  api: AIFormApi,
  options: UseReviewKeyboardOptions = {},
): ReviewKeyboardState {
  const enabled = options.enabled ?? true;
  const apiRef = useRef(api);
  const { highlightedOption, setHighlightedOption: setSharedHighlight } =
    api.review;
  const highlightedOptionRef = useRef(highlightedOption);
  apiRef.current = api;
  highlightedOptionRef.current = highlightedOption;

  const setHighlightedOption = useCallback<Dispatch<SetStateAction<number>>>(
    (next) => {
      const value =
        typeof next === "function" ? next(highlightedOptionRef.current) : next;
      highlightedOptionRef.current = value;
      setSharedHighlight(value);
    },
    [setSharedHighlight],
  );

  useEffect(() => {
    setHighlightedOption(0);
    if (!enabled || !api.review.active || !api.review.cursorFieldId) return;

    const field = apiRef.current.field(api.review.cursorFieldId);
    field.focus();
    const span =
      field.state.provenance?.span ??
      field.state.suggestion?.span ??
      field.state.question?.options[0]?.span;
    if (span) {
      apiRef.current.sources.focusSpan(span);
    } else {
      apiRef.current.sources.clearActiveSpan();
    }
  }, [
    api.review.active,
    api.review.cursorFieldId,
    enabled,
    setHighlightedOption,
  ]);

  useEffect(() => {
    if (!enabled || !api.review.active) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      const currentApi = apiRef.current;
      const fieldId = currentApi.review.cursorFieldId;
      if (!currentApi.review.active || !fieldId) return;

      const field = currentApi.field(fieldId);
      const target = event.target;
      // Let Enter insert a newline in a textarea the user is editing, but a
      // ghost textarea has no user text yet: Enter accepts the suggestion.
      if (
        event.key === "Enter" &&
        target instanceof HTMLTextAreaElement &&
        !event.metaKey &&
        !event.ctrlKey &&
        field.status !== "ghost"
      ) {
        return;
      }

      if (event.key === "Tab") {
        currentApi.review.end();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        currentApi.review.skip();
        return;
      }
      if (event.key === "Enter" && event.shiftKey) {
        event.preventDefault();
        currentApi.review.prev();
        return;
      }

      if (field.status === "ghost") {
        if (event.key === "Enter") {
          event.preventDefault();
          field.accept();
          currentApi.review.next();
        } else if (
          event.key === "Backspace" &&
          field.inputProps.value.length === 0
        ) {
          event.preventDefault();
          field.dismiss();
        }
        return;
      }

      if (field.status === "question") {
        const options = field.state.question?.options ?? [];
        if (
          options.length > 0 &&
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          const delta = ["ArrowRight", "ArrowDown"].includes(event.key)
            ? 1
            : -1;
          const next =
            (highlightedOptionRef.current + delta + options.length) %
            options.length;
          setHighlightedOption(next);
          const span = options[next]?.span;
          if (span) currentApi.sources.focusSpan(span);
        } else if (event.key === "Enter") {
          const option = options[highlightedOptionRef.current];
          if (!option) return;
          event.preventDefault();
          field.answer(option.value, highlightedOptionRef.current);
          currentApi.review.next();
        }
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        field.accept();
        currentApi.review.next();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [api.review.active, enabled, setHighlightedOption]);

  return { highlightedOption, setHighlightedOption };
}
