import { distance } from "fastest-levenshtein";

import type { Span } from "./state";

export type LocatedSpan = Omit<Span, "sourceId">;

export interface QuoteLocationOptions {
  hintOffset?: number;
  minSimilarity?: number;
  maxFuzzyQuoteLength?: number;
}

export interface NormalizedLocationText {
  text: string;
  starts: number[];
  ends: number[];
}

interface MappedCharacter {
  character: string;
  start: number;
  end: number;
}

const CURLY_SINGLE_QUOTES = /[\u2018\u2019\u201a\u201b]/g;
const CURLY_DOUBLE_QUOTES = /[\u201c\u201d\u201e\u201f]/g;
const DASHES = /[\u2013\u2014\u2212]/g;
const LETTER = /^\p{L}$/u;
const WHITESPACE = /^\s$/u;

function foldCase(text: string): string {
  return text
    .toLocaleLowerCase("und")
    .replace(/\u00df/g, "ss")
    .replace(/\u03c2/g, "\u03c3");
}

function normalizedGraphemes(input: string): MappedCharacter[] {
  const characters: MappedCharacter[] = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const segments = [...segmenter.segment(input)];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) {
      continue;
    }
    const next = segments[index + 1];
    const end = next?.index ?? input.length;
    const normalized = foldCase(segment.segment.normalize("NFKC"))
      .replace(CURLY_SINGLE_QUOTES, "'")
      .replace(CURLY_DOUBLE_QUOTES, '"')
      .replace(DASHES, "-");

    for (const character of normalized) {
      characters.push({ character, start: segment.index, end });
    }
  }

  return characters;
}

function withoutHyphenatedLineBreaks(
  characters: MappedCharacter[],
): MappedCharacter[] {
  const result: MappedCharacter[] = [];

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (!character) {
      continue;
    }

    const previous = result.at(-1);
    const next = characters[index + 1];
    const afterCrLf = characters[index + 2];
    const isLineBreak = next?.character === "\n";
    const isCrLf = next?.character === "\r" && afterCrLf?.character === "\n";
    const following = isCrLf ? characters[index + 3] : characters[index + 2];

    if (
      character.character === "-" &&
      previous &&
      LETTER.test(previous.character) &&
      (isLineBreak || isCrLf) &&
      following &&
      LETTER.test(following.character)
    ) {
      index += isCrLf ? 2 : 1;
      continue;
    }

    result.push(character);
  }

  return result;
}

export function normalizeTextForQuoteLocation(
  input: string,
): NormalizedLocationText {
  const characters = withoutHyphenatedLineBreaks(normalizedGraphemes(input));
  const collapsed: MappedCharacter[] = [];

  for (const character of characters) {
    if (WHITESPACE.test(character.character)) {
      if (collapsed.length === 0) {
        continue;
      }
      const previous = collapsed.at(-1);
      if (previous?.character === " ") {
        previous.end = character.end;
      } else {
        collapsed.push({ ...character, character: " " });
      }
      continue;
    }
    collapsed.push(character);
  }

  if (collapsed.at(-1)?.character === " ") {
    collapsed.pop();
  }

  const starts: number[] = [];
  const ends: number[] = [];
  let text = "";
  for (const character of collapsed) {
    text += character.character;
    for (let index = 0; index < character.character.length; index += 1) {
      starts.push(character.start);
      ends.push(character.end);
    }
  }

  return { text, starts, ends };
}

function spanFromNormalizedRange(
  original: string,
  normalized: NormalizedLocationText,
  start: number,
  end: number,
  match: LocatedSpan["match"],
): LocatedSpan | null {
  const originalStart = normalized.starts[start];
  const originalEnd = normalized.ends[end - 1];
  if (originalStart === undefined || originalEnd === undefined) {
    return null;
  }
  return {
    start: originalStart,
    end: originalEnd,
    quote: original.slice(originalStart, originalEnd),
    match,
  };
}

function exactIndex(text: string, quote: string, hintOffset?: number): number {
  const first = text.indexOf(quote);
  if (first < 0 || hintOffset === undefined || !Number.isFinite(hintOffset)) {
    return first;
  }

  let best = first;
  let bestDistance = Math.abs(first - hintOffset);
  let candidate = text.indexOf(quote, first + 1);
  while (candidate >= 0) {
    const candidateDistance = Math.abs(candidate - hintOffset);
    if (candidateDistance < bestDistance) {
      best = candidate;
      bestDistance = candidateDistance;
    }
    candidate = text.indexOf(quote, candidate + 1);
  }
  return best;
}

function isTokenStart(text: string, index: number): boolean {
  return index === 0 || /\s/u.test(text[index - 1] ?? "");
}

function isTokenEnd(text: string, index: number): boolean {
  return index === text.length || /\s/u.test(text[index] ?? "");
}

function occurrences(text: string, needle: string): number[] {
  const matches: number[] = [];
  let index = text.indexOf(needle);
  while (index >= 0) {
    if (isTokenStart(text, index) && isTokenEnd(text, index + needle.length)) {
      matches.push(index);
    }
    index = text.indexOf(needle, index + 1);
  }
  return matches;
}

function snapToTokenStart(text: string, index: number): number {
  let result = index;
  while (result > 0 && !/\s/u.test(text[result - 1] ?? "")) {
    result -= 1;
  }
  return result;
}

function snapToTokenEnd(text: string, index: number): number {
  let result = index;
  while (result < text.length && !/\s/u.test(text[result] ?? "")) {
    result += 1;
  }
  return result;
}

function fuzzyRange(
  text: string,
  quote: string,
  minSimilarity: number,
): { start: number; end: number } | null {
  const tokens = [...quote.matchAll(/\S+/gu)].map((match) => match[0]);
  if (tokens.length < 6) {
    return null;
  }

  const firstAnchor = tokens.slice(0, 3).join(" ");
  const lastAnchor = tokens.slice(-3).join(" ");
  const minimumLength = Math.floor(quote.length * 0.8);
  const maximumLength = Math.ceil(quote.length * 1.2);
  let best: { start: number; end: number; similarity: number } | null = null;

  for (const anchorStart of occurrences(text, firstAnchor)) {
    const earliestLastAnchor = anchorStart + minimumLength - lastAnchor.length;
    const latestLastAnchor = anchorStart + maximumLength - lastAnchor.length;
    let lastAnchorStart = text.indexOf(
      lastAnchor,
      Math.max(anchorStart + firstAnchor.length, earliestLastAnchor),
    );

    while (lastAnchorStart >= 0 && lastAnchorStart <= latestLastAnchor) {
      if (
        isTokenStart(text, lastAnchorStart) &&
        isTokenEnd(text, lastAnchorStart + lastAnchor.length)
      ) {
        const start = snapToTokenStart(text, anchorStart);
        const end = snapToTokenEnd(text, lastAnchorStart + lastAnchor.length);
        const window = text.slice(start, end);
        const denominator = Math.max(window.length, quote.length);
        const similarity =
          denominator === 0 ? 1 : 1 - distance(window, quote) / denominator;
        if (
          similarity >= minSimilarity &&
          (!best || similarity > best.similarity)
        ) {
          best = { start, end, similarity };
        }
      }
      lastAnchorStart = text.indexOf(lastAnchor, lastAnchorStart + 1);
    }
  }

  return best ? { start: best.start, end: best.end } : null;
}

export function locateQuote(
  text: string,
  quote: string,
  options: QuoteLocationOptions = {},
): LocatedSpan | null {
  if (quote.length === 0) {
    return null;
  }

  const exactStart = exactIndex(text, quote, options.hintOffset);
  if (exactStart >= 0) {
    return {
      start: exactStart,
      end: exactStart + quote.length,
      quote: text.slice(exactStart, exactStart + quote.length),
      match: "exact",
    };
  }

  const normalizedText = normalizeTextForQuoteLocation(text);
  const normalizedQuote = normalizeTextForQuoteLocation(quote).text;
  if (normalizedQuote.length === 0) {
    return null;
  }

  const normalizedStart = normalizedText.text.indexOf(normalizedQuote);
  if (normalizedStart >= 0) {
    return spanFromNormalizedRange(
      text,
      normalizedText,
      normalizedStart,
      normalizedStart + normalizedQuote.length,
      "normalized",
    );
  }

  if (quote.length > (options.maxFuzzyQuoteLength ?? 500)) {
    return null;
  }

  const range = fuzzyRange(
    normalizedText.text,
    normalizedQuote,
    options.minSimilarity ?? 0.85,
  );
  return range
    ? spanFromNormalizedRange(
        text,
        normalizedText,
        range.start,
        range.end,
        "fuzzy",
      )
    : null;
}
