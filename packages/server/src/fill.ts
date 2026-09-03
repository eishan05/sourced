import {
  type FillEvent,
  type FillRequest,
  fieldsOf,
  policyOf,
  type SerializedFieldDefinition,
} from "@ai-native-forms/core";

import type { ModelAdapter } from "./model/adapter";
import { type PipelineState, runPipeline } from "./pipeline";
import { buildPrompt } from "./prompt";
import { FillItemSchema, FillRequestSchema } from "./schema";

const DEFAULT_PER_SOURCE_CHARS = 60_000;
const DEFAULT_TOTAL_SOURCE_CHARS = 150_000;

export interface FillOptions {
  adapter: ModelAdapter;
  maxSourceChars?: number;
  maxQuestions?: number;
  idGen?: () => string;
  signal?: AbortSignal;
}

export class FillRequestError extends Error {
  readonly issues: unknown;

  constructor(issues: unknown) {
    super("Invalid fill request");
    this.name = "FillRequestError";
    this.issues = issues;
  }
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function sourceLimitMessage(
  req: FillRequest,
  perSourceLimit: number,
): string | undefined {
  const oversized = req.sources.find(
    (source) => source.text.length > perSourceLimit,
  );
  if (oversized) {
    return `Source ${JSON.stringify(oversized.id)} exceeds ${perSourceLimit} characters`;
  }
  const total = req.sources.reduce(
    (sum, source) => sum + source.text.length,
    0,
  );
  if (total > DEFAULT_TOTAL_SOURCE_CHARS) {
    return `Sources exceed ${DEFAULT_TOTAL_SOURCE_CHARS} total characters`;
  }
  return undefined;
}

export async function* fill(
  request: FillRequest,
  opts: FillOptions,
): AsyncIterable<FillEvent> {
  const parsed = FillRequestSchema.safeParse(request);
  if (!parsed.success) {
    throw new FillRequestError(parsed.error.issues);
  }
  const req = parsed.data;
  const idGen = opts.idGen ?? (() => crypto.randomUUID());
  const fillId = idGen();
  const fields = fieldsOf(req.form);
  const targetFieldIds =
    req.mode === "check"
      ? []
      : fields
          .filter((field) => policyOf(field) !== "human")
          .map((field) => field.id);
  yield { type: "start", fillId, targetFieldIds };

  const limitError = sourceLimitMessage(
    req,
    opts.maxSourceChars ?? DEFAULT_PER_SOURCE_CHARS,
  );
  if (limitError) {
    yield { type: "error", fillId, message: limitError, retryable: false };
    return;
  }

  const fieldsById = new Map<string, SerializedFieldDefinition>(
    fields.map((field) => [field.id, field]),
  );
  const context = {
    form: req.form,
    fieldsById,
    sources: req.sources,
    today: req.today,
    fillId,
    idGen,
  };
  let pipelineState: PipelineState = {
    questionCount: 0,
    proposalsByField: new Map(),
  };
  const counts = { proposals: 0, questions: 0, flags: 0 };
  const usage = { inputTokens: 0, outputTokens: 0 };
  let hasUsage = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let validItems = 0;
    const prompt = buildPrompt(req, { strictReminder: attempt === 1 });
    try {
      for await (const modelEvent of opts.adapter.streamItems({
        ...prompt,
        signal: opts.signal,
      })) {
        if (opts.signal?.aborted) {
          return;
        }
        if (modelEvent.type === "usage") {
          hasUsage = true;
          usage.inputTokens += modelEvent.inputTokens;
          usage.outputTokens += modelEvent.outputTokens;
          continue;
        }
        if (modelEvent.type === "error") {
          yield {
            type: "error",
            fillId,
            message: errorMessage(modelEvent.error),
            retryable: modelEvent.retryable,
          };
          return;
        }

        const item = FillItemSchema.safeParse(modelEvent.item);
        if (!item.success) {
          yield {
            type: "dropped",
            fillId,
            reason: "malformed",
            detail: item.error.issues[0]?.message,
          };
          continue;
        }
        const result = runPipeline(
          item.data,
          context,
          pipelineState,
          opts.maxQuestions ?? 5,
        );
        pipelineState = result.state;
        for (const event of result.events) {
          if (
            event.type === "proposal" ||
            event.type === "question" ||
            event.type === "flag" ||
            event.type === "no_evidence"
          ) {
            validItems += 1;
          }
          if (event.type === "proposal") counts.proposals += 1;
          if (event.type === "question") counts.questions += 1;
          if (event.type === "flag") counts.flags += 1;
          yield event;
        }
      }
    } catch (error) {
      if (opts.signal?.aborted) {
        return;
      }
      yield {
        type: "error",
        fillId,
        message: errorMessage(error),
        retryable: true,
      };
      return;
    }

    if (validItems > 0) {
      yield {
        type: "done",
        fillId,
        counts,
        ...(hasUsage ? { usage } : {}),
      };
      return;
    }
  }

  yield {
    type: "error",
    fillId,
    message: "model returned no items",
    retryable: true,
  };
}
