import type { FieldValue, SerializedFormDefinition } from "./definition";
import type { Flag, Proposal, Question, Source, Span } from "./state";

export type DropReason =
  | "policy_human"
  | "quote_not_found"
  | "invalid_value"
  | "unknown_field"
  | "malformed"
  | "check-mode";

export type FillEvent =
  | { type: "start"; fillId: string; targetFieldIds: string[] }
  | { type: "proposal"; proposal: Proposal }
  | { type: "question"; question: Question }
  | { type: "flag"; flag: Flag }
  | { type: "no_evidence"; fillId: string; fieldId: string }
  | {
      type: "dropped";
      fillId: string;
      fieldId?: string;
      reason: DropReason;
      detail?: string;
    }
  | { type: "ping" }
  | {
      type: "done";
      fillId: string;
      counts: { proposals: number; questions: number; flags: number };
      usage?: { inputTokens: number; outputTokens: number };
    }
  | { type: "error"; fillId: string; message: string; retryable: boolean };

export interface FillRequest {
  form: SerializedFormDefinition;
  sources: Source[];
  mode: "fill" | "check";
  currentValues?: Record<string, FieldValue>;
  today: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isFieldValue(value: unknown): value is FieldValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    isStringArray(value)
  );
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isSpan(value: unknown): value is Span {
  return (
    isRecord(value) &&
    typeof value.sourceId === "string" &&
    typeof value.start === "number" &&
    typeof value.end === "number" &&
    typeof value.quote === "string" &&
    ["exact", "normalized", "fuzzy"].includes(String(value.match))
  );
}

function isProposal(value: unknown): value is Proposal {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fillId === "string" &&
    typeof value.fieldId === "string" &&
    (value.kind === "extracted" || value.kind === "inferred") &&
    isFieldValue(value.value) &&
    (value.span === null || isSpan(value.span)) &&
    isOptionalString(value.quote) &&
    isOptionalString(value.rationale) &&
    (value.normalization === undefined ||
      (isRecord(value.normalization) &&
        typeof value.normalization.raw === "string" &&
        typeof value.normalization.explanation === "string"))
  );
}

function isQuestion(value: unknown): value is Question {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fillId === "string" &&
    typeof value.fieldId === "string" &&
    typeof value.text === "string" &&
    typeof value.allowFreeText === "boolean" &&
    Array.isArray(value.options) &&
    value.options.every(
      (option) =>
        isRecord(option) &&
        typeof option.label === "string" &&
        isFieldValue(option.value) &&
        (option.span === undefined || isSpan(option.span)),
    )
  );
}

function isFlag(value: unknown): value is Flag {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fillId === "string" &&
    isStringArray(value.fieldIds) &&
    typeof value.message === "string" &&
    (value.severity === "warning" || value.severity === "error") &&
    (value.acknowledged === undefined ||
      typeof value.acknowledged === "boolean")
  );
}

function isCounts(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.proposals === "number" &&
    typeof value.questions === "number" &&
    typeof value.flags === "number"
  );
}

export function isFillEvent(value: unknown): value is FillEvent {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "start":
      return (
        typeof value.fillId === "string" && isStringArray(value.targetFieldIds)
      );
    case "proposal":
      return isProposal(value.proposal);
    case "question":
      return isQuestion(value.question);
    case "flag":
      return isFlag(value.flag);
    case "no_evidence":
      return (
        typeof value.fillId === "string" && typeof value.fieldId === "string"
      );
    case "dropped":
      return (
        typeof value.fillId === "string" &&
        isOptionalString(value.fieldId) &&
        [
          "policy_human",
          "quote_not_found",
          "invalid_value",
          "unknown_field",
          "malformed",
          "check-mode",
        ].includes(String(value.reason)) &&
        isOptionalString(value.detail)
      );
    case "ping":
      return true;
    case "done":
      return (
        typeof value.fillId === "string" &&
        isCounts(value.counts) &&
        (value.usage === undefined ||
          (isRecord(value.usage) &&
            typeof value.usage.inputTokens === "number" &&
            typeof value.usage.outputTokens === "number"))
      );
    case "error":
      return (
        typeof value.fillId === "string" &&
        typeof value.message === "string" &&
        typeof value.retryable === "boolean"
      );
    default:
      return false;
  }
}

export function encodeFillEvent(event: FillEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function malformedEvent(error: unknown): FillEvent {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    type: "error",
    fillId: "",
    message: `Malformed fill event: ${detail}`,
    retryable: false,
  };
}

function parseLine(line: string): FillEvent {
  const parsed: unknown = JSON.parse(line);
  if (!isFillEvent(parsed)) {
    throw new Error("event has an invalid shape");
  }
  return parsed;
}

export async function* parseFillEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncIterable<FillEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let remainder = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        remainder += decoder.decode();
        break;
      }

      remainder += decoder.decode(value, { stream: true });
      let newline = remainder.indexOf("\n");
      while (newline >= 0) {
        const line = remainder.slice(0, newline);
        remainder = remainder.slice(newline + 1);
        if (line.trim().length > 0) {
          try {
            yield parseLine(line);
          } catch (error) {
            yield malformedEvent(error);
            return;
          }
        }
        newline = remainder.indexOf("\n");
      }
    }

    if (remainder.trim().length > 0) {
      try {
        yield parseLine(remainder);
      } catch (error) {
        yield malformedEvent(error);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
