import {
  type FieldValue,
  type Proposal,
  policyOf,
} from "@ai-native-forms/core";
import type { ReactNode } from "react";

import { useField } from "../context";

export interface GhostRenderProps {
  suggestion: Proposal;
  accept(): void;
  dismiss(): void;
}

export interface GhostProps {
  fieldId: string;
  className?: string;
  children?: (props: GhostRenderProps) => ReactNode;
  groupLabel?: string;
  renderValue?: (value: FieldValue) => ReactNode;
}

function displayValue(value: FieldValue) {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

export function Ghost({
  fieldId,
  className,
  children,
  groupLabel,
  renderValue,
}: GhostProps) {
  const field = useField(fieldId);
  const suggestion = field.state.suggestion;
  if (policyOf(field.def) === "human" || !suggestion || field.value !== null) {
    return null;
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: Keep the existing headless div markup while grouping the suggestion actions.
    <div aria-label={groupLabel} className={className} data-ghost role="group">
      {children ? (
        children({ suggestion, accept: field.accept, dismiss: field.dismiss })
      ) : (
        <>
          <span>
            {renderValue?.(suggestion.value) ?? displayValue(suggestion.value)}
          </span>
          <button
            aria-label={`Accept suggestion for ${field.def.label}`}
            onClick={field.accept}
            type="button"
          >
            Accept
          </button>
          <button
            aria-label={`Dismiss suggestion for ${field.def.label}`}
            onClick={field.dismiss}
            type="button"
          >
            Dismiss
          </button>
        </>
      )}
    </div>
  );
}
