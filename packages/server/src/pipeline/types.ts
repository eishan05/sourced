import type {
  FieldValue,
  FillEvent,
  Normalization,
  SerializedFieldDefinition,
  SerializedFormDefinition,
  Source,
  Span,
} from "@ai-native-forms/core";

import type { FillItem } from "../schema";

export interface PipelineContext {
  form: SerializedFormDefinition;
  fieldsById: ReadonlyMap<string, SerializedFieldDefinition>;
  sources: Source[];
  today: string;
  fillId: string;
  idGen: () => string;
}

export type PipelineResult<T> =
  | { ok: true; value: T }
  | { ok: false; event: FillEvent };

export interface ValidatedProposal {
  kind: "proposal";
  fieldId: string;
  basis: "extracted" | "inferred";
  raw: string | string[];
  sourceId?: string;
  quote?: string;
  rationale?: string;
}

export interface ValidatedQuestion {
  kind: "question";
  fieldId: string;
  question: string;
  options: NonNullable<FillItem["options"]>;
  allowFreeText: boolean;
}

export interface ValidatedFlag {
  kind: "flag";
  fieldIds: string[];
  message: string;
  severity: "warning" | "error";
}

export interface ValidatedNoEvidence {
  kind: "no_evidence";
  fieldId: string;
}

export type ValidatedItem =
  | ValidatedProposal
  | ValidatedQuestion
  | ValidatedFlag
  | ValidatedNoEvidence;

export interface CoercedProposal extends Omit<ValidatedProposal, "raw"> {
  value: FieldValue;
  raw: string;
  normalization?: Normalization;
}

export interface CoercedQuestion extends Omit<ValidatedQuestion, "options"> {
  options: Array<{
    label: string;
    value: FieldValue;
    quote?: string;
    sourceId?: string;
  }>;
}

export type CoercedItem =
  | CoercedProposal
  | CoercedQuestion
  | ValidatedFlag
  | ValidatedNoEvidence;

export interface LocatedProposal extends CoercedProposal {
  span: Span | null;
}

export type LocatedItem =
  | LocatedProposal
  | CoercedQuestion
  | ValidatedFlag
  | ValidatedNoEvidence;

export interface ProposalDraft {
  kind: "proposal";
  fieldId: string;
  basis: "extracted" | "inferred";
  value: FieldValue;
  span: Span | null;
  quote?: string;
  rationale?: string;
  normalization?: Normalization;
}

export interface QuestionDraft {
  kind: "question";
  fieldId: string;
  question: string;
  options: Array<{
    label: string;
    value: FieldValue;
    quote?: string;
    sourceId?: string;
  }>;
  allowFreeText: boolean;
}

export type EnforcedItem =
  | ProposalDraft
  | QuestionDraft
  | ValidatedFlag
  | ValidatedNoEvidence;
