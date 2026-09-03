export function normalizeBoolean(raw: string): boolean | null {
  switch (raw.trim().toLowerCase()) {
    case "yes":
    case "true":
    case "y":
      return true;
    case "no":
    case "false":
    case "n":
      return false;
    default:
      return null;
  }
}
