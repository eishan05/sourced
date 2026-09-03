import type {
  FieldValue,
  SerializedFormDefinition,
  ValidationIssue,
} from "../definition";

export interface Source {
  id: string;
  name: string;
  kind: "paste" | "pdf";
  text: string;
  pageOffsets?: number[];
  addedAt: number;
}

export interface Span {
  sourceId: string;
  start: number;
  end: number;
  quote: string;
  match: "exact" | "normalized" | "fuzzy";
}

export interface Normalization {
  raw: string;
  explanation: string;
}

export interface Proposal {
  id: string;
  fillId: string;
  fieldId: string;
  kind: "extracted" | "inferred";
  value: FieldValue;
  span: Span | null;
  quote?: string;
  rationale?: string;
  normalization?: Normalization;
}

export interface QuestionOption {
  label: string;
  value: FieldValue;
  span?: Span;
}

export interface Question {
  id: string;
  fillId: string;
  fieldId: string;
  text: string;
  options: QuestionOption[];
  allowFreeText: boolean;
}

export interface Flag {
  id: string;
  fillId: string;
  fieldIds: string[];
  message: string;
  severity: "warning" | "error";
  acknowledged?: boolean;
}

export type ProvenanceKind =
  | "extracted"
  | "inferred"
  | "answered"
  | "user"
  | "prefill";

export interface Provenance {
  kind: ProvenanceKind;
  span?: Span;
  proposalId?: string;
  questionId?: string;
  normalization?: Normalization;
}

export type ReviewStatus = "none" | "pending" | "accepted" | "overridden";

export interface FieldState {
  value: FieldValue;
  provenance: Provenance | null;
  reviewStatus: ReviewStatus;
  suggestion: Proposal | null;
  question: Question | null;
  previous: { value: FieldValue; provenance: Provenance | null } | null;
  issues: ValidationIssue[];
}

export interface FillRun {
  id: string;
  status: "streaming" | "done" | "error";
  sourceIds: string[];
  counts: { proposals: number; questions: number; flags: number };
  noEvidenceFieldIds: string[];
  error?: string;
}

export interface FormState {
  definition: SerializedFormDefinition;
  sources: Record<string, Source>;
  fields: Record<string, FieldState>;
  fills: Record<string, FillRun>;
  activeFillId: string | null;
  flags: Flag[];
  review: { active: boolean; order: string[]; cursor: number };
  submit: {
    status: "idle" | "submitting" | "submitted" | "failed";
    error?: string;
  };
}
