import { describe, expect, it } from "vitest";
import { z } from "zod";

import { serializeForm } from "./serialize";
import type { FormDefinition } from "./types";

function containsFunction(value: unknown): boolean {
  if (typeof value === "function") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(containsFunction);
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(containsFunction);
  }
  return false;
}

describe("serializeForm", () => {
  it("deep-copies a form and strips every field validator", () => {
    const form = {
      id: "test",
      title: "Test",
      version: 1,
      sections: [
        {
          id: "main",
          title: "Main",
          fields: [
            {
              id: "name",
              type: "text",
              label: "Name",
              constraints: { minLength: 2 },
              validate: z.string().startsWith("A"),
            },
          ],
        },
      ],
    } satisfies FormDefinition;

    const serialized = serializeForm(form);

    expect(serialized).not.toBe(form);
    expect(serialized.sections).not.toBe(form.sections);
    expect(serialized.sections[0]?.fields[0]).not.toBe(
      form.sections[0]?.fields[0],
    );
    expect(serialized.sections[0]?.fields[0]?.constraints).not.toBe(
      form.sections[0]?.fields[0]?.constraints,
    );
    expect(serialized.sections[0]?.fields[0]).not.toHaveProperty("validate");
    expect(containsFunction(serialized)).toBe(false);
  });

  it("produces stable JSON while preserving input key order", () => {
    const form = {
      title: "Test",
      id: "test",
      sections: [],
      version: 1,
    } satisfies FormDefinition;

    const first = JSON.stringify(serializeForm(form));
    const second = JSON.stringify(serializeForm(form));

    expect(first).toBe(second);
    expect(first).toBe(
      '{"title":"Test","id":"test","sections":[],"version":1}',
    );
  });
});
