import { parseDate } from "chrono-node";

export interface NormalizedDate {
  value: string;
  explanation?: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;
const NAMED_MONTH =
  /^(?:(last)\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?$/i;

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day, 12);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function parseReference(today: string): Date | null {
  const match = ISO_DATE.exec(today);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return isRealDate(year, month, day)
    ? new Date(year, month - 1, day, 12)
    : null;
}

function formatDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function explained(raw: string, value: string): NormalizedDate {
  return { value, explanation: `Read '${raw}' as ${value}` };
}

export function normalizeDate(
  raw: string,
  opts: { today: string },
): NormalizedDate | null {
  const input = raw.trim();
  const reference = parseReference(opts.today);
  if (!reference || input.length === 0) {
    return null;
  }

  const isoDate = ISO_DATE.exec(input);
  if (isoDate) {
    const year = Number(isoDate[1]);
    const month = Number(isoDate[2]);
    const day = Number(isoDate[3]);
    return isRealDate(year, month, day) ? { value: input } : null;
  }

  if (/^(?:present|current|now)$/i.test(input)) {
    return explained(input, opts.today);
  }

  const isoMonth = ISO_MONTH.exec(input);
  if (isoMonth) {
    const month = Number(isoMonth[2]);
    if (month < 1 || month > 12) {
      return null;
    }
    return explained(input, `${isoMonth[1]}-${isoMonth[2]}-01`);
  }

  const namedMonth = NAMED_MONTH.exec(input.replace(/\./g, ""));
  if (namedMonth) {
    const parsed = parseDate(input, reference, { forwardDate: false });
    const monthName = namedMonth[2]?.toLowerCase();
    const month = monthName ? MONTHS[monthName] : undefined;
    if (!parsed || month === undefined) {
      return null;
    }
    const statedYear = namedMonth[3] ? Number(namedMonth[3]) : undefined;
    const year =
      statedYear ??
      (month <= reference.getMonth() + 1
        ? reference.getFullYear()
        : reference.getFullYear() - 1);
    return explained(
      input,
      `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`,
    );
  }

  const parsed = parseDate(input, reference, { forwardDate: false });
  return parsed ? explained(input, formatDate(parsed)) : null;
}
