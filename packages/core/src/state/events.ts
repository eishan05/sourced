import type { FieldValue } from "../definition";
import type { Flag, Proposal, Question, Source, Span } from "./types";

export type FormEvent =
  | { type: "SOURCE_ADDED"; source: Source }
  | { type: "SOURCE_REMOVED"; sourceId: string }
  | { type: "FILL_STARTED"; fillId: string; sourceIds: string[] }
  | { type: "FILL_FINISHED"; fillId: string }
  | { type: "FILL_FAILED"; fillId: string; error: string }
  | { type: "PROPOSAL_RECEIVED"; proposal: Proposal }
  | { type: "QUESTION_RECEIVED"; question: Question }
  | { type: "FLAG_RECEIVED"; flag: Flag }
  | { type: "NO_EVIDENCE"; fillId: string; fieldId: string }
  | { type: "ACCEPT"; fieldId: string }
  | { type: "OVERRIDE"; fieldId: string; value: FieldValue }
  | {
      type: "ANSWER";
      fieldId: string;
      value: FieldValue;
      optionIndex?: number;
    }
  | { type: "DISMISS_SUGGESTION"; fieldId: string }
  | { type: "REVERT"; fieldId: string }
  | { type: "USE_SELECTION"; fieldId: string; value: FieldValue; span: Span }
  | { type: "CLEAR_AI"; fieldId?: string }
  | { type: "ACKNOWLEDGE_FLAG"; flagId: string }
  | { type: "REVIEW_START" }
  | { type: "REVIEW_NEXT" }
  | { type: "REVIEW_SKIP" }
  | { type: "REVIEW_PREV" }
  | { type: "REVIEW_GOTO"; fieldId: string }
  | { type: "REVIEW_END" }
  | { type: "SUBMIT_REQUESTED" }
  | { type: "SUBMIT_SUCCEEDED" }
  | { type: "SUBMIT_FAILED"; error: string }
  | { type: "RESET" };
