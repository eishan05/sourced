import type { SubmitBlocker } from "@sourced/core";

import { useAIFormApi } from "../context";
import type { AIFormApi } from "../useAIForm";

export interface SubmitSummaryProps {
  className?: string;
  onSubmit?: () => void | Promise<void>;
  confirmClear?: (message: string) => boolean;
}

function summarySentence(api: AIFormApi): string {
  const { summary } = api.submit;
  const parts = Object.entries(summary.bySource).map(
    ([source, count]) => `${count} from ${source}`,
  );
  if (summary.user > 0) parts.push(`${summary.user} you typed`);
  if (summary.inferred > 0) {
    parts.push(`${summary.inferred} inferred and marked`);
  }
  if (summary.answered > 0) parts.push(`${summary.answered} answered`);
  if (summary.prefill > 0) parts.push(`${summary.prefill} prefilled`);
  return parts.length > 0 ? `${parts.join(", ")}.` : "No values to submit yet.";
}

function blockerTarget(
  api: AIFormApi,
  blocker: SubmitBlocker,
): string | undefined {
  if (blocker.fieldId) return blocker.fieldId;
  return api.state.flags.find((flag) => flag.id === blocker.flagId)
    ?.fieldIds[0];
}

function blockerReason(api: AIFormApi, blocker: SubmitBlocker): string {
  switch (blocker.reason) {
    case "unreviewed":
      return "needs review";
    case "unanswered":
      return "needs an answer";
    case "invalid":
      return "has an invalid value";
    case "required":
      return "is required";
    case "flag":
      return (
        api.state.flags.find((flag) => flag.id === blocker.flagId)?.message ??
        "needs attention"
      );
  }
}

export function SubmitSummary({
  className,
  onSubmit,
  confirmClear = (message) => window.confirm(message),
}: SubmitSummaryProps) {
  const api = useAIFormApi();
  const submitting = api.submit.status === "submitting";

  const focusBlocker = (blocker: SubmitBlocker): void => {
    const fieldId = blockerTarget(api, blocker);
    if (!fieldId) return;
    api.review.goTo(fieldId);
    api.field(fieldId).focus();
  };

  return (
    <section className={className} data-submit-summary>
      <p>{summarySentence(api)}</p>
      {api.submit.blockers.length > 0 ? (
        <div data-submit-blockers>
          <p>Complete these items before submitting:</p>
          <ul>
            {api.submit.blockers.map((blocker) => {
              const fieldId = blockerTarget(api, blocker);
              const label = fieldId ? api.field(fieldId).def.label : "Form";
              return (
                <li key={`${blocker.reason}-${fieldId ?? blocker.flagId}`}>
                  <button onClick={() => focusBlocker(blocker)} type="button">
                    {label}: {blockerReason(api, blocker)}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div data-submit-actions>
        <button
          disabled={api.submit.blockers.length > 0 || submitting}
          onClick={() => void (onSubmit ? onSubmit() : api.submit.request())}
          type="button"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
        <button
          onClick={() => {
            if (
              confirmClear(
                "Clear every value and suggestion added by the AI? Your answers will stay.",
              )
            ) {
              api.submit.clearAllAI();
            }
          }}
          type="button"
        >
          Clear everything the AI filled
        </button>
      </div>
      {api.state.submit.error ? <p>{api.state.submit.error}</p> : null}
    </section>
  );
}
