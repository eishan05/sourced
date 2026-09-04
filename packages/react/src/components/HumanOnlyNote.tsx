import { policyOf } from "@sourced/core";

import { useField } from "../context";

export interface HumanOnlyNoteProps {
  fieldId: string;
  className?: string;
}

export function HumanOnlyNote({ fieldId, className }: HumanOnlyNoteProps) {
  const field = useField(fieldId);
  if (policyOf(field.def) !== "human") return null;

  return (
    <p className={className} id={`${fieldId}-human-note`}>
      You need to answer this one yourself
    </p>
  );
}
