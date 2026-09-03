import { policyOf } from "@ai-native-forms/core";

import { useField } from "../context";

export interface ProvenanceChipProps {
  fieldId: string;
  className?: string;
}

export function ProvenanceChip({ fieldId, className }: ProvenanceChipProps) {
  const field = useField(fieldId);
  const { chip } = field;
  if (
    policyOf(field.def) === "human" &&
    chip.kind &&
    ["extracted", "inferred", "answered"].includes(chip.kind)
  ) {
    return null;
  }
  if (!chip.label || !chip.kind) return null;

  return (
    <button
      className={className}
      data-kind={chip.kind}
      onClick={chip.focus}
      type="button"
    >
      {chip.label}
    </button>
  );
}
