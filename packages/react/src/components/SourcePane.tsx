import { normalizeValue, policyOf, type SourceHighlight } from "@sourced/core";
import { type ReactNode, useEffect, useRef } from "react";

import { useAIFormApi } from "../context";

export interface SourcePaneProps {
  sourceId?: string;
  className?: string;
}

export interface UseForMenuProps {
  sourceId?: string;
  className?: string;
}

const SELECTION_FIELD_TYPES = new Set([
  "text",
  "textarea",
  "email",
  "phone",
  "date",
  "number",
]);
const TEXT_LIKE_FIELD_TYPES = new Set(["text", "textarea", "email"]);

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
  pageOffsets: number[] = [],
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
  const pageMarkers = new Map<number, number[]>();
  pageOffsets.forEach((offset, index) => {
    if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return;
    boundaries.add(offset);
    const pages = pageMarkers.get(offset) ?? [];
    pages.push(index + 1);
    pageMarkers.set(offset, pages);
  });
  const points = [...boundaries].sort((left, right) => left - right);
  const nodes: ReactNode[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (start === undefined) continue;
    for (const page of pageMarkers.get(start) ?? []) {
      nodes.push(
        <span data-offset={start} data-page={page} key={`page-${page}`}>
          Page {page}
        </span>,
      );
    }
    if (end === undefined || start === end) continue;
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
        key={`mark-${start}-${end}`}
      >
        {segment}
      </mark>,
    );
  }

  return nodes;
}

function closestElement(node: Node | null): Element | null {
  return node instanceof Element ? node : (node?.parentElement ?? null);
}

function sourceTextLength(root: Node): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let length = 0;
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (!parent?.closest("[data-page]")) {
      length += node.textContent?.length ?? 0;
    }
    node = walker.nextNode();
  }
  return length;
}

function sourceOffset(
  root: HTMLElement,
  container: Node,
  offset: number,
): number | null {
  if (container !== root && !root.contains(container)) return null;
  const prefix = document.createRange();
  prefix.selectNodeContents(root);
  try {
    prefix.setEnd(container, offset);
  } catch {
    return null;
  }
  return sourceTextLength(prefix.cloneContents());
}

export function UseForMenu({ sourceId, className }: UseForMenuProps) {
  const api = useAIFormApi();
  const selection = api.sources.selection;
  const visible = Boolean(
    selection && (!sourceId || selection.sourceId === sourceId),
  );

  useEffect(() => {
    if (!visible) return;
    const close = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      api.sources.setSelection(null);
      window.getSelection()?.removeAllRanges();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [api.sources, visible]);

  if (!selection || !visible) return null;

  const eligibleFields = Object.values(api.fields).filter(
    (field) =>
      field.visible &&
      policyOf(field.def) !== "human" &&
      SELECTION_FIELD_TYPES.has(field.def.type),
  );
  const choose = (fieldId: string): void => {
    const field = api.field(fieldId);
    const normalized = normalizeValue(field.def, selection.quote, {
      today: api.today,
    });
    const value = TEXT_LIKE_FIELD_TYPES.has(field.def.type)
      ? selection.quote
      : (normalized?.value ?? selection.quote);
    const applySelectedValue = field.useSelection;
    applySelectedValue(value, { ...selection, match: "exact" });
    api.sources.setSelection(null);
    window.getSelection()?.removeAllRanges();
    field.focus();
  };

  return (
    <div className={className} data-use-for-menu>
      <p>Use selection for</p>
      <ul>
        {eligibleFields.map((field) => (
          <li key={field.def.id}>
            <button onClick={() => choose(field.def.id)} type="button">
              {field.def.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SourcePane({ sourceId, className }: SourcePaneProps) {
  const api = useAIFormApi();
  const rootRef = useRef<HTMLUListElement>(null);
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

  const captureSelection = (): void => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      api.sources.setSelection(null);
      return;
    }
    const range = selection.getRangeAt(0);
    const startPre = closestElement(range.startContainer)?.closest<HTMLElement>(
      "pre[data-source-text]",
    );
    const endPre = closestElement(range.endContainer)?.closest<HTMLElement>(
      "pre[data-source-text]",
    );
    if (
      !startPre ||
      startPre !== endPre ||
      !rootRef.current?.contains(startPre)
    ) {
      api.sources.setSelection(null);
      return;
    }
    const sourceElement = startPre.closest<HTMLElement>("[data-source-id]");
    const selectedSourceId = sourceElement?.dataset.sourceId;
    const source = api.sources.list.find(
      (candidate) => candidate.id === selectedSourceId,
    );
    const start = sourceOffset(
      startPre,
      range.startContainer,
      range.startOffset,
    );
    const end = sourceOffset(startPre, range.endContainer, range.endOffset);
    if (!source || start === null || end === null || end <= start) {
      api.sources.setSelection(null);
      return;
    }
    const quote = source.text.slice(start, end);
    api.sources.setSelection({ sourceId: source.id, start, end, quote });
  };

  return (
    <ul
      className={className}
      data-source-pane
      onKeyUp={(event) => {
        if (event.key !== "Escape") captureSelection();
      }}
      onMouseUp={captureSelection}
      ref={rootRef}
    >
      {sources.map((source) => (
        <li
          data-source-id={source.id}
          data-source-kind={source.kind}
          key={source.id}
        >
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
              source.pageOffsets,
            )}
          </pre>
          <UseForMenu sourceId={source.id} />
        </li>
      ))}
    </ul>
  );
}
