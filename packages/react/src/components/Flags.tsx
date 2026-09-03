import { useAIFormApi } from "../context";

export interface FlagsProps {
  fieldId?: string;
  className?: string;
}

export function Flags({ fieldId, className }: FlagsProps) {
  const api = useAIFormApi();
  const flags = fieldId
    ? (api.flags.byFirstField[fieldId] ?? [])
    : api.flags.all;

  if (flags.length === 0) return null;

  const jumpTo = (targetFieldId: string): void => {
    api.review.goTo(targetFieldId);
    api.field(targetFieldId).focus();
  };

  return (
    <ul
      className={className}
      data-flags
      id={fieldId ? `${fieldId}-flags` : undefined}
    >
      {flags.map((flag) => (
        <li
          data-acknowledged={flag.acknowledged ? "true" : undefined}
          data-severity={flag.severity}
          key={flag.id}
        >
          <span data-flag-severity>{flag.severity}</span>
          <p>{flag.message}</p>
          <div data-flag-fields>
            {flag.fieldIds.map((targetFieldId) => (
              <button
                key={targetFieldId}
                onClick={() => jumpTo(targetFieldId)}
                type="button"
              >
                {api.field(targetFieldId).def.label}
              </button>
            ))}
          </div>
          {flag.severity === "error" && !flag.acknowledged ? (
            <button
              data-acknowledge-flag
              onClick={() => api.flags.acknowledge(flag.id)}
              type="button"
            >
              Acknowledge
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
