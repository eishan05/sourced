import type { ReactNode } from "react";

import { useField } from "../context";
import type { FieldApi } from "../useAIForm";

export interface FieldProps {
  id: string;
  children: (field: FieldApi) => ReactNode;
  className?: string;
}

export function Field({ id, children, className }: FieldProps) {
  const field = useField(id);
  return (
    <div
      className={className}
      data-field={id}
      data-provenance={field.state.provenance?.kind}
      data-status={field.status}
    >
      {children(field)}
    </div>
  );
}
