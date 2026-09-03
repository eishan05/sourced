export interface NormalizedNumber {
  value: number;
  explanation?: string;
}

const NUMBER =
  /[+-]?(?:(?:\d{1,3}(?:[,\u00a0\u202f ]\d{3})+)|\d+)(?:\.\d+)?|[+-]?\.\d+/;

export function normalizeNumber(raw: string): NormalizedNumber | null {
  const input = raw.trim();
  const withoutCurrency = input.replace(/\p{Sc}/gu, "");
  const match = NUMBER.exec(withoutCurrency);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0].replace(/[,\u00a0\u202f ]/g, ""));
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return input === String(parsed)
    ? { value: parsed }
    : { value: parsed, explanation: `Read '${input}' as ${parsed}` };
}
