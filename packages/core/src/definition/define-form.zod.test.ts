import { describe, expect, it } from "vitest";
import { z } from "zod";

import { fieldById } from "./conditions";
import { defineForm } from "./define-form";
import { validateField } from "./validate";

describe("defineForm with zod validators", () => {
  const form = defineForm({
    id: "zod-form",
    title: "Zod form",
    version: 1,
    sections: [
      {
        id: "main",
        title: "Main",
        fields: [
          {
            id: "code",
            type: "text",
            label: "Code",
            validate: z.string().regex(/^[A-Z]{3}$/, "Three capital letters"),
          },
        ],
      },
    ],
  });

  it("does not freeze the validator, so stateful zod checks still run", () => {
    const code = fieldById(form, "code");
    expect(code).toBeDefined();
    expect(Object.isFrozen(code)).toBe(true);
    expect(Object.isFrozen(code?.validate)).toBe(false);
  });

  it("runs the zod validator repeatedly after defineForm", () => {
    const code = fieldById(form, "code");
    if (!code) {
      throw new Error("missing field");
    }
    expect(validateField(code, "abc")).toEqual([
      { code: "custom", message: "Three capital letters", severity: "error" },
    ]);
    expect(validateField(code, "ABC")).toEqual([]);
    expect(validateField(code, "abc")).toHaveLength(1);
  });
});
