import type { SourceHighlight } from "@ai-native-forms/core";
import { type ReactNode, useEffect, useRef } from "react";

import { useAIFormApi } from "../context";

export interface SourcePaneProps {
  sourceId?: string;
  className?: string;
}

const KIND_PRIORITY: Record<SourceHighlight["kind"], number> = {
  extracted: 0,
  option: 1,
  user: 2,
  inferred: 3,
};

function sourceSegments(
  text: string,
  highlights: SourceHighlight[],
  activeSpan: ReturnType<typeof useAIFormApi>["sources"]["activeSpan"],
): ReactNode[] {
  const validHighlights = highlights.filter(
    (highlight) =>
      highlight.span.start >= 0 &&
      highlight.span.end > highlight.span.start &&
      highlight.span.start < text.length &&
      highlight.span.end <= text.length,
  );
  const boundaries = new Set([0, text.length]);
  for (const highlight of validHighlights) {
    boundaries.add(highlight.span.start);
    boundaries.add(highlight.span.end);
  }
  const points = [...boundaries].sort((left, right) => left - right);
  const nodes: ReactNode[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start === undefined || end === undefined || start === end) continue;
    const segment = text.slice(start, end);
    const covering = validHighlights.filter(
      (highlight) => highlight.span.start < end && highlight.span.end > start,
    );
    if (covering.length === 0) {
      nodes.push(segment);
      continue;
    }

    const first = covering[0];
    if (!first) continue;
    const fieldIds = [...new Set(covering.map((item) => item.fieldId))];
    const kind = [...covering].sort(
      (left, right) => KIND_PRIORITY[left.kind] - KIND_PRIORITY[right.kind],
    )[0]?.kind;
    const active = Boolean(
      activeSpan &&
        activeSpan.sourceId === first.span.sourceId &&
        start >= activeSpan.start &&
        end <= activeSpan.end,
    );
    nodes.push(
      <mark
        data-active={active ? "true" : undefined}
        data-field-id={first.fieldId}
        data-field-ids={fieldIds.join(" ")}
        data-kind={kind}
        key={`${start}-${end}`}
      >
        {segment}
      </mark>,
    );
  }

  return nodes;
}

export function SourcePane({ sourceId, className }: SourcePaneProps) {
  const api = useAIFormApi();
  const rootRef = useRef<HTMLDivElement>(null);
  const sources = sourceId
    ? api.sources.list.filter((source) => source.id === sourceId)
    : api.sources.list;

  useEffect(() => {
    if (!api.sources.activeSpan) return;
    const activeMark = rootRef.current?.querySelector<HTMLElement>(
      'mark[data-active="true"]',
    );
    activeMark?.scrollIntoView?.({ block: "center" });
  }, [api.sources.activeSpan]);

  return (
    <div className={className} data-source-pane ref={rootRef}>
      {sources.map((source) => (
        <section data-source-id={source.id} key={source.id}>
          <header>
            <span>{source.name}</span>
            <button onClick={() => api.sources.remove(source.id)} type="button">
              Remove
            </button>
          </header>
          <pre data-source-text>
            {sourceSegments(
              source.text,
              api.sources.highlights(source.id),
              api.sources.activeSpan,
            )}
          </pre>
        </section>
      ))}
    </div>
  );
}
