import type {
  FieldDefinition,
  FieldValue,
  SerializedFieldDefinition,
  ValidationIssue,
} from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function issue(code: string, message: string): ValidationIssue {
  return { code, message, severity: "error" };
}

function isEmpty(value: FieldValue): boolean {
  return (
    value === null ||
    (typeof value === "string" && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0)
  );
}

function hasExpectedType(
  field: FieldDefinition | SerializedFieldDefinition,
  value: FieldValue,
): boolean {
  switch (field.type) {
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "multiselect":
      return (
        Array.isArray(value) &&
        value.every((selectedValue) => typeof selectedValue === "string")
      );
    default:
      return typeof value === "string";
  }
}

function isRealDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return day <= (daysInMonth[month - 1] ?? 0);
}

function validateTextConstraints(
  field: FieldDefinition | SerializedFieldDefinition,
  value: string,
  issues: ValidationIssue[],
): void {
  const constraints = field.constraints;
  if (!constraints) {
    return;
  }

  if (
    (constraints.minLength !== undefined &&
      value.length < constraints.minLength) ||
    (constraints.maxLength !== undefined &&
      value.length > constraints.maxLength)
  ) {
    issues.push(issue("length", `${field.label} has an invalid length`));
  }

  if (constraints.pattern !== undefined) {
    let matches = false;
    try {
      matches = new RegExp(constraints.pattern).test(value);
    } catch {
      matches = false;
    }

    if (!matches) {
      issues.push(
        issue(
          "pattern",
          constraints.patternMessage ?? `${field.label} has an invalid format`,
        ),
      );
    }
  }
}

function runBuiltInValidation(
  field: FieldDefinition | SerializedFieldDefinition,
  value: FieldValue,
  issues: ValidationIssue[],
): void {
  switch (field.type) {
    case "text":
    case "textarea":
      validateTextConstraints(field, value as string, issues);
      break;
    case "email":
      if (!EMAIL_PATTERN.test(value as string)) {
        issues.push(
          issue("email_format", `${field.label} must be a valid email`),
        );
      }
      validateTextConstraints(field, value as string, issues);
      break;
    case "phone":
      if ((value as string).replace(/\D/g, "").length < 7) {
        issues.push(
          issue(
            "phone_format",
            `${field.label} must contain at least 7 digits`,
          ),
        );
      }
      validateTextConstraints(field, value as string, issues);
      break;
    case "date":
      if (!isRealDate(value as string)) {
        issues.push(
          issue(
            "date_format",
            `${field.label} must be a valid YYYY-MM-DD date`,
          ),
        );
      }
      break;
    case "number": {
      const number = value as number;
      const { min, max } = field.constraints ?? {};
      if (
        !Number.isFinite(number) ||
        (min !== undefined && number < min) ||
        (max !== undefined && number > max)
      ) {
        issues.push(
          issue("range", `${field.label} is outside the allowed range`),
        );
      }
      break;
    }
    case "boolean":
      break;
    case "select":
      if (!field.options?.some((option) => option.value === value)) {
        issues.push(
          issue("option", `${field.label} must be an allowed option`),
        );
      }
      break;
    case "multiselect": {
      const selectedValues = value as string[];
      const allowedValues = new Set(
        field.options?.map((option) => option.value) ?? [],
      );
      const hasUnknownValue = selectedValues.some(
        (selectedValue) => !allowedValues.has(selectedValue),
      );
      const hasDuplicates =
        new Set(selectedValues).size !== selectedValues.length;
      if (hasUnknownValue || hasDuplicates) {
        issues.push(
          issue(
            "option",
            `${field.label} must contain unique, allowed options`,
          ),
        );
      }
      break;
    }
  }
}

export function validateField(
  field: FieldDefinition | SerializedFieldDefinition,
  value: FieldValue,
): ValidationIssue[] {
  if (isEmpty(value) && field.required) {
    return [issue("required", `${field.label} is required`)];
  }
  if (value === null) {
    return [];
  }

  const issues: ValidationIssue[] = [];
  if (!hasExpectedType(field, value)) {
    issues.push(
      issue("type_mismatch", `${field.label} has the wrong value type`),
    );
  } else {
    runBuiltInValidation(field, value, issues);
  }

  if ("validate" in field && field.validate) {
    const result = field.validate.safeParse(value);
    if (!result.success) {
      issues.push(
        ...result.error.issues.map((zodIssue) =>
          issue("custom", zodIssue.message),
        ),
      );
    }
  }

  return issues;
}
