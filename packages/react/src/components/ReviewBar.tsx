import { useAIFormApi } from "../context";

export interface ReviewBarProps {
  className?: string;
}

export function ReviewBar({ className }: ReviewBarProps) {
  const api = useAIFormApi();
  const reviewFields = Object.values(api.fields).filter(
    (field) =>
      field.visible &&
      (field.state.reviewStatus === "pending" ||
        field.state.suggestion !== null ||
        field.state.question !== null),
  );
  const filledByAI = reviewFields.filter(
    (field) =>
      field.state.reviewStatus === "pending" || field.state.suggestion !== null,
  ).length;

  if (api.review.active && api.review.cursorFieldId) {
    const cursorField = api.field(api.review.cursorFieldId);
    return (
      <aside aria-live="polite" className={className} data-review-bar>
        <div>
          <strong>
            {api.review.progress.index} of {api.review.progress.total}
          </strong>{" "}
          <span>{cursorField.def.label}</span>
        </div>
        <div>
          <span>
            <kbd>Enter</kbd> accept
          </span>{" "}
          <span>
            <kbd>Esc</kbd> skip
          </span>{" "}
          <span>
            <kbd>Shift+Enter</kbd> back
          </span>{" "}
          <span>
            <kbd>Tab</kbd> exit
          </span>
        </div>
      </aside>
    );
  }

  if (api.fill.status !== "done") return null;

  if (reviewFields.length > 0) {
    const hasReviewed = api.review.order.length > 0;
    return (
      <aside aria-live="polite" className={className} data-review-bar>
        <p>
          {filledByAI} {filledByAI === 1 ? "field" : "fields"} filled. Review
          them.
        </p>
        <button onClick={api.review.start} type="button">
          {hasReviewed ? "Review again" : "Start review"}
        </button>
      </aside>
    );
  }

  const hasUnreviewedBlocker = api.submit.blockers.some(
    (blocker) => blocker.reason === "unreviewed",
  );
  if (!hasUnreviewedBlocker) {
    return (
      <aside aria-live="polite" className={className} data-review-bar>
        All reviewed
      </aside>
    );
  }

  return null;
}
