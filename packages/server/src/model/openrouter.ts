import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ModelAdapter } from "./adapter";
import { createAISDKAdapter } from "./ai-sdk";

export interface OpenRouterAdapterOptions {
  apiKey?: string;
  model?: string;
  effort?: OpenRouterReasoningEffort | null;
  requireParameters?: boolean;
}

export type OpenRouterReasoningEffort = "none" | "low" | "medium" | "high";

const MODEL_DEFAULTS: Readonly<
  Record<string, { effort?: OpenRouterReasoningEffort }>
> = {
  "openai/gpt-5.6-luna": { effort: "none" },
};

export function createOpenRouterAdapter(
  opts: OpenRouterAdapterOptions = {},
): ModelAdapter {
  const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenRouter API key is required. Pass apiKey or set OPENROUTER_API_KEY.",
    );
  }

  const openrouter = createOpenRouter({ apiKey, compatibility: "strict" });
  const modelId =
    opts.model ?? process.env.AI_FORMS_MODEL ?? "openai/gpt-5.6-luna";
  const configuredEffort =
    opts.effort === null
      ? undefined
      : (opts.effort ?? MODEL_DEFAULTS[modelId]?.effort);
  const model = openrouter.chat(modelId, {
    provider: { require_parameters: opts.requireParameters ?? true },
    structuredOutputs: { strict: false },
    ...(configuredEffort ? { reasoning: { effort: configuredEffort } } : {}),
  });

  return createAISDKAdapter(model);
}
