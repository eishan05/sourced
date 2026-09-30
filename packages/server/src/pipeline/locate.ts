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
  const field = context.fieldsById.get(item.fieldId);
  if (
    located.span &&
    field &&
    ["number", "date", "boolean", "select", "multiselect"].includes(field.type)
  ) {
    const source = context.sources.find(
      (source) => source.id === located.span?.sourceId,
    );
    const before = source?.text.slice(0, located.span.start) ?? "";
    const after = source?.text.slice(located.span.end) ?? "";
    // A real substring is insufficient if it cuts a word or a numeric expression.
    const splitsWord =
      /[\p{L}\p{N}_]$/u.test(before) || /^[\p{L}\p{N}_]/u.test(after);
    const splitsNumber =
      field.type === "number" &&
      (/[+\-−.,]$|\d[ \u00a0\u202f]+$/u.test(before) ||
        /^[.,]\d|^[ \u00a0\u202f]+\d/u.test(after));
    if (splitsWord || splitsNumber) located.span = null;
  }
  return {
    ok: true,
    value: { ...item, quote: located.quote, span: located.span },
  };
}
