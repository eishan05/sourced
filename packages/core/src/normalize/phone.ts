export function normalizePhone(
  raw: string,
  opts: { defaultCountry?: "US" } = {},
): string | null {
  const input = raw.trim();
  const digits = input.replace(/\D/g, "");
  if (digits.length < 7) {
    return null;
  }

  if ((opts.defaultCountry ?? "US") === "US" && digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return input.startsWith("+") ? `+${digits}` : digits;
}
