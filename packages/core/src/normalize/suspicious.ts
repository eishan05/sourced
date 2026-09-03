import type {
  FieldValue,
  SerializedFieldDefinition,
  ValidationIssue,
} from "../definition";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FIXED_DIGITS = /^\^(?:\\d|\[0-9\])\{(\d+)\}\$$/;

function warning(code: string, message: string): ValidationIssue {
  return { code, message, severity: "warning" };
}

export function suspiciousIssues(
  field: SerializedFieldDefinition,
  value: FieldValue,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (typeof value === "string" && /^\d+$/.test(value)) {
    const fixedLength = field.constraints?.pattern
      ? FIXED_DIGITS.exec(field.constraints.pattern)
      : null;
    if (fixedLength) {
      const expected = Number(fixedLength[1]);
      if (value.length === expected - 1) {
        issues.push(warning("suspicious_length", "Looks one digit short"));
      } else if (value.length === expected + 1) {
        issues.push(warning("suspicious_length", "Looks one digit long"));
      }
    }
  }

  if (field.type === "email" && typeof value === "string") {
    const at = value.lastIndexOf("@");
    if (at >= 0 && !value.slice(at + 1).includes(".")) {
      issues.push(
        warning(
          "suspicious_email",
          "Email address may be missing a dot after @",
        ),
      );
    }
  }

  if (field.type === "date" && typeof value === "string") {
    const match = ISO_DATE.exec(value);
    if (match) {
      const date = new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        12,
      );
      const now = new Date();
      const pastLimit = new Date(now);
      const futureLimit = new Date(now);
      pastLimit.setFullYear(now.getFullYear() - 100);
      futureLimit.setFullYear(now.getFullYear() + 10);
      if (date < pastLimit) {
        issues.push(
          warning("suspicious_date", "Date is more than 100 years in the past"),
        );
      } else if (date > futureLimit) {
        issues.push(
          warning(
            "suspicious_date",
            "Date is more than 10 years in the future",
          ),
        );
      }
    }
  }

  return issues;
}
