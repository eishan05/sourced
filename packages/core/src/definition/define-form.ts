import type {
  Condition,
  FieldDefinition,
  FieldType,
  FormDefinition,
} from "./types";

const TEXT_LIKE_TYPES: ReadonlySet<FieldType> = new Set([
  "text",
  "textarea",
  "email",
  "phone",
]);

const NUMBER_CONSTRAINTS = new Set(["min", "max"]);
const TEXT_CONSTRAINTS = new Set([
  "minLength",
  "maxLength",
  "pattern",
  "patternMessage",
]);

function conditionFieldIds(condition: Condition): string[] {
  if ("field" in condition) {
    return [condition.field];
  }

  const children = "all" in condition ? condition.all : condition.any;
  return children.flatMap(conditionFieldIds);
}

function validateCondition(
  condition: Condition,
  ownerDescription: string,
  knownFieldIds: ReadonlySet<string>,
  problems: string[],
  selfId?: string,
): void {
  for (const referencedId of conditionFieldIds(condition)) {
    if (!knownFieldIds.has(referencedId)) {
      problems.push(
        `${ownerDescription} showWhen references unknown field "${referencedId}"`,
      );
    } else if (referencedId === selfId) {
      problems.push(`${ownerDescription} showWhen references itself`);
    }
  }
}

function validateOptions(field: FieldDefinition, problems: string[]): void {
  const usesOptions = field.type === "select" || field.type === "multiselect";

  if (usesOptions && (!field.options || field.options.length === 0)) {
    problems.push(
      `Field "${field.id}" (${field.type}) must define at least one option`,
    );
    return;
  }

  if (!usesOptions && field.options !== undefined) {
    problems.push(
      `Field "${field.id}" (${field.type}) must not define options`,
    );
    return;
  }

  if (!field.options) {
    return;
  }

  const optionValues = new Set<string>();
  for (const option of field.options) {
    if (optionValues.has(option.value)) {
      problems.push(
        `Field "${field.id}" has duplicate option value "${option.value}"`,
      );
    }
    optionValues.add(option.value);
  }
}

function validateConstraints(field: FieldDefinition, problems: string[]): void {
  if (!field.constraints) {
    return;
  }

  const allowed =
    field.type === "number"
      ? NUMBER_CONSTRAINTS
      : TEXT_LIKE_TYPES.has(field.type)
        ? TEXT_CONSTRAINTS
        : undefined;

  for (const key of Object.keys(field.constraints)) {
    if (!allowed?.has(key)) {
      problems.push(
        `Field "${field.id}" (${field.type}) cannot use constraint "${key}"`,
      );
    }
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return value;
  }

  const object = value as object;
  if (seen.has(object)) {
    return value;
  }
  seen.add(object);

  for (const key of Reflect.ownKeys(object)) {
    // Zod validators mutate internal state (e.g. RegExp.lastIndex); never freeze them.
    if (key === "validate") {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (descriptor && "value" in descriptor) {
      deepFreeze(descriptor.value, seen);
    }
  }

  return Object.freeze(value);
}

export function defineForm<const F extends FormDefinition>(form: F): F {
  const problems: string[] = [];
  const sectionIds = new Set<string>();
  const fieldIds = new Set<string>();

  for (const section of form.sections) {
    if (sectionIds.has(section.id)) {
      problems.push(`Duplicate section id "${section.id}"`);
    }
    sectionIds.add(section.id);

    for (const field of section.fields) {
      if (fieldIds.has(field.id)) {
        problems.push(`Duplicate field id "${field.id}"`);
      }
      fieldIds.add(field.id);
    }
  }

  for (const section of form.sections) {
    if (section.showWhen) {
      validateCondition(
        section.showWhen,
        `Section "${section.id}"`,
        fieldIds,
        problems,
      );
    }

    for (const field of section.fields) {
      validateOptions(field, problems);
      validateConstraints(field, problems);

      if (field.showWhen) {
        validateCondition(
          field.showWhen,
          `Field "${field.id}"`,
          fieldIds,
          problems,
          field.id,
        );
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid form definition:\n- ${problems.join("\n- ")}`);
  }

  return deepFreeze(form);
}
