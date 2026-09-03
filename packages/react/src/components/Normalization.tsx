import { useField } from "../context";

export interface NormalizationProps {
  fieldId: string;
  className?: string;
}

export function Normalization({ fieldId, className }: NormalizationProps) {
  const field = useField(fieldId);
  const normalization = field.normalization;
  if (!normalization) return null;

  const isUserNormalization =
    field.state.provenance?.normalization === undefined;

  return (
    <p className={className} data-normalization>
      {normalization.explanation}
      {isUserNormalization ? (
        <>
          {" "}
          <button onClick={field.revertNormalization} type="button">
            Use what I typed
          </button>
        </>
      ) : null}
    </p>
  );
}
