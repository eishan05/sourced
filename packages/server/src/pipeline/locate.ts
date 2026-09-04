import { locateQuote, type Source, type Span } from "@sourced/core";

import type {
  CoercedItem,
  LocatedItem,
  PipelineContext,
  PipelineResult,
} from "./types";

export function locateModelQuote(
  quote: string | undefined,
  sourceId: string | undefined,
  sources: Source[],
): { quote?: string; span: Span | null } {
  if (!quote) {
    return { span: null };
  }
  const shortened = quote.slice(0, 300);
  const requested = sourceId
    ? sources.find((source) => source.id === sourceId)
    : undefined;
  const candidates = requested ? [requested] : sources;

  for (const source of candidates) {
    const located = locateQuote(source.text, shortened);
    if (located) {
      return {
        quote: shortened,
        span: { sourceId: source.id, ...located },
      };
    }
  }
  return { quote: shortened, span: null };
}

export function locateItem(
  item: CoercedItem,
  context: PipelineContext,
): PipelineResult<LocatedItem> {
  if (item.kind !== "proposal") {
    return { ok: true, value: item };
  }
  const located = locateModelQuote(item.quote, item.sourceId, context.sources);
  return {
    ok: true,
    value: { ...item, quote: located.quote, span: located.span },
  };
}
