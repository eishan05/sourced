import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ModelAdapter } from "./adapter";
import { createAISDKAdapter } from "./ai-sdk";

export interface OpenRouterProviderRouting {
  /** Provider slugs to try first, in order (OpenRouter `provider.order`). */
  order?: string[];
  /** Fall back to other providers when the ordered ones fail (default true). */
  allowFallbacks?: boolean;
  /** Provider slugs never to use. */
  ignore?: string[];
}

export interface OpenRouterAdapterOptions {
  apiKey?: string;
  model?: string;
  effort?: OpenRouterReasoningEffort | null;
  requireParameters?: boolean;
  /** Provider routing preferences; `null` disables the per-model default. */
  routing?: OpenRouterProviderRouting | null;
}

export type OpenRouterReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high";

const MODEL_DEFAULTS: Readonly<
  Record<
    string,
    { effort?: OpenRouterReasoningEffort; routing?: OpenRouterProviderRouting }
  >
> = {
  // Measured 2026-09-04 on the bundled resumes: Friendli streams the first
  // item in ~1 s and finishes in ~3 s; OpenRouter's default pick for this
  // model (NextBit) took 3-6 s to the first item and 8-23 s overall.
  "z-ai/glm-5.3-flash": {
    effort: "minimal",
    routing: { order: ["Friendli", "Together", "Fireworks"] },
  },
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
    opts.model ?? process.env.SOURCED_MODEL ?? "z-ai/glm-5.3-flash";
  const defaults = MODEL_DEFAULTS[modelId];
  const configuredEffort =
    opts.effort === null ? undefined : (opts.effort ?? defaults?.effort);
  const routing =
    opts.routing === null ? undefined : (opts.routing ?? defaults?.routing);
  const model = openrouter.chat(modelId, {
    provider: {
      require_parameters: opts.requireParameters ?? true,
      ...(routing?.order ? { order: routing.order } : {}),
      ...(routing?.allowFallbacks !== undefined
        ? { allow_fallbacks: routing.allowFallbacks }
        : {}),
      ...(routing?.ignore ? { ignore: routing.ignore } : {}),
    },
    structuredOutputs: { strict: false },
    ...(configuredEffort ? { reasoning: { effort: configuredEffort } } : {}),
  });

  return createAISDKAdapter(model);
}
