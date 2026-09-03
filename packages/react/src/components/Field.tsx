import { policyOf } from "@ai-native-forms/core";
import type { ReactNode } from "react";

import { useAIFormApi } from "../context";
import type { FieldApi } from "../useAIForm";

export interface FieldProps {
  id: string;
  children: (field: FieldApi) => ReactNode;
  className?: string;
}

export function Field({ id, children, className }: FieldProps) {
  const api = useAIFormApi();
  const field = api.field(id);
  return (
    <div
      className={className}
      data-cursor={
        api.review.active && api.review.cursorFieldId === id
          ? "true"
          : undefined
      }
      data-field={id}
      data-policy={policyOf(field.def)}
      data-provenance={field.state.provenance?.kind}
      data-settled={field.justFilled ? "true" : undefined}
      data-status={field.status}
    >
      {children(field)}
    </div>
  );
}
