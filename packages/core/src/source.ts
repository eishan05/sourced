import type { Source } from "./state";

const REMOVED_CHARACTERS = /[\u00ad\u200b-\u200d\ufeff]/g;

function normalizeSourceText(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(REMOVED_CHARACTERS, "");
}

export interface CreateSourceInput {
  name: string;
  kind: "paste" | "pdf";
  text: string;
  pageTexts?: string[];
  id?: string;
  now?: number;
}

export function createSource(input: CreateSourceInput): Source {
  let text: string;
  let pageOffsets: number[] | undefined;

  if (input.pageTexts !== undefined) {
    const pages = input.pageTexts.map(normalizeSourceText);
    pageOffsets = [];
    let offset = 0;
    for (const page of pages) {
      pageOffsets.push(offset);
      offset += page.length + 2;
    }
    text = pages.join("\n\n");
  } else {
    text = normalizeSourceText(input.text);
  }

  return {
    id: input.id ?? crypto.randomUUID(),
    name: input.name,
    kind: input.kind,
    text,
    ...(pageOffsets ? { pageOffsets } : {}),
    addedAt: input.now ?? Date.now(),
  };
}
