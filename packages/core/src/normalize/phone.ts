export function normalizePhone(
  raw: string,
  opts: { defaultCountry?: "US" } = {},
): string | null {
  const input = raw.trim();
  const digits = input.replace(/\D/g, "");
  if (digits.length < 7) {
    return null;
  }

  if ((opts.defaultCountry ?? "US") === "US") {
    const localDigits =
      digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    if (localDigits.length === 10) {
      return `+1 (${localDigits.slice(0, 3)}) ${localDigits.slice(3, 6)}-${localDigits.slice(6)}`;
    }
  }

  return input.startsWith("+") ? `+${digits}` : digits;
}
