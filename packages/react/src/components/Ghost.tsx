import type { FieldValue } from "@ai-native-forms/core";
import type { ReactNode } from "react";

import { useField } from "../context";

export interface GhostProps {
  fieldId: string;
  className?: string;
  renderValue?: (value: FieldValue) => ReactNode;
}

function displayValue(value: FieldValue) {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

export function Ghost({ fieldId, className, renderValue }: GhostProps) {
  const field = useField(fieldId);
  const suggestion = field.state.suggestion;
  if (!suggestion || field.value !== null) return null;

  return (
    <div className={className} data-ghost>
      <span>
        {renderValue?.(suggestion.value) ?? displayValue(suggestion.value)}
      </span>
      <button onClick={field.accept} type="button">
        Accept
      </button>
      <button onClick={field.dismiss} type="button">
        Dismiss
      </button>
    </div>
  );
}
