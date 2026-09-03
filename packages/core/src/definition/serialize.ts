import type { FormDefinition, SerializedFormDefinition } from "./types";

function cloneWithoutValidate(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneWithoutValidate);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const copy: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key !== "validate") {
      copy[key] = cloneWithoutValidate(child);
    }
  }
  return copy;
}

export function serializeForm(form: FormDefinition): SerializedFormDefinition {
  return cloneWithoutValidate(form) as SerializedFormDefinition;
}
