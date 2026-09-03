import type { FieldValue, SerializedFieldDefinition } from "../definition";
import { normalizeBoolean } from "./boolean";
import { normalizeDate } from "./date";
import { normalizeNumber } from "./number";
import { normalizePhone } from "./phone";

export interface NormalizeValueOptions {
  today: string;
  defaultCountry?: "US";
}

export interface NormalizedValue {
  value: FieldValue;
  explanation?: string;
}

function optionValue(
  field: SerializedFieldDefinition,
  raw: string,
): string | null {
  const input = raw.trim().toLocaleLowerCase("und");
  const byValue = field.options?.find(
    (option) => option.value.toLocaleLowerCase("und") === input,
  );
  if (byValue) {
    return byValue.value;
  }
  return (
    field.options?.find(
      (option) => option.label.toLocaleLowerCase("und") === input,
    )?.value ?? null
  );
}

export function normalizeValue(
  field: SerializedFieldDefinition,
  raw: string,
  opts: NormalizeValueOptions,
): NormalizedValue | null {
  switch (field.type) {
    case "number":
      return normalizeNumber(raw);
    case "date":
      return normalizeDate(raw, opts);
    case "phone": {
      const value = normalizePhone(raw, {
        defaultCountry: opts.defaultCountry,
      });
      return value === null ? null : { value };
    }
    case "boolean": {
      const value = normalizeBoolean(raw);
      return value === null ? null : { value };
    }
    case "select": {
      const value = optionValue(field, raw);
      return value === null ? null : { value };
    }
    case "multiselect": {
      const parts = raw
        .split(/[,;\n]+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      const values = parts.map((part) => optionValue(field, part));
      return values.some((value) => value === null)
        ? null
        : { value: values as string[] };
    }
    case "text":
    case "textarea":
    case "email":
      return { value: raw.trim() };
  }
}
