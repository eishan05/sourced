import { useField } from "../context";

export interface ProvenanceChipProps {
  fieldId: string;
  className?: string;
}

export function ProvenanceChip({ fieldId, className }: ProvenanceChipProps) {
  const { chip } = useField(fieldId);
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
