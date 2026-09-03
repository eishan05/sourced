import type {
  Condition,
  FieldDefinition,
  FieldValue,
  FormDefinition,
  Policy,
  SerializedFieldDefinition,
  SerializedFormDefinition,
} from "./types";

export function fieldsOf(
  form: FormDefinition | SerializedFormDefinition,
): FieldDefinition[] {
  return form.sections.flatMap((section) => section.fields);
}

export function fieldById(
  form: FormDefinition | SerializedFormDefinition,
  id: string,
): FieldDefinition | undefined {
  return fieldsOf(form).find((field) => field.id === id);
}

export function policyOf(
  field: FieldDefinition | SerializedFieldDefinition,
): Policy {
  return field.policy ?? "extract";
}

function fieldValuesEqual(left: FieldValue, right: FieldValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => item === right[index])
    );
  }

  return left === right;
}

function isTruthy(value: FieldValue): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value === true;
}

export function evaluateCondition(
  condition: Condition,
  values: Record<string, FieldValue>,
): boolean {
  if ("all" in condition) {
    return condition.all.every((child) => evaluateCondition(child, values));
  }
  if ("any" in condition) {
    return condition.any.some((child) => evaluateCondition(child, values));
  }

  const value = values[condition.field] ?? null;
  if ("equals" in condition) {
    return fieldValuesEqual(value, condition.equals);
  }
  if ("in" in condition) {
    return condition.in.some((candidate) => fieldValuesEqual(value, candidate));
  }

  return condition.truthy === isTruthy(value);
}

export function isFieldVisible(
  form: FormDefinition | SerializedFormDefinition,
  fieldId: string,
  values: Record<string, FieldValue>,
): boolean {
  for (const section of form.sections) {
    const field = section.fields.find((candidate) => candidate.id === fieldId);
    if (!field) {
      continue;
    }

    return (
      (!section.showWhen || evaluateCondition(section.showWhen, values)) &&
      (!field.showWhen || evaluateCondition(field.showWhen, values))
    );
  }

  return false;
}
