import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { FieldDefinition, FieldValue } from "./types";
import { validateField } from "./validate";

function field(
  type: FieldDefinition["type"],
  overrides: Partial<FieldDefinition> = {},
): FieldDefinition {
  return { id: type, type, label: type, ...overrides };
}

function codes(definition: FieldDefinition, value: FieldValue): string[] {
  return validateField(definition, value).map(
    (validationIssue) => validationIssue.code,
  );
}

describe("validateField", () => {
  it.each([
    ["text", "hello"],
    ["textarea", "a longer note"],
    ["email", "person@example.com"],
    ["phone", "+1 (415) 555-0100"],
    ["date", "2024-02-29"],
    ["number", 42],
    ["boolean", true],
  ] satisfies Array<[FieldDefinition["type"], FieldValue]>)(
    "accepts a valid %s value",
    (type, value) => {
      expect(validateField(field(type), value)).toEqual([]);
    },
  );

  it("accepts valid select and multiselect values", () => {
    const options = [
      { value: "go", label: "Go" },
      { value: "rust", label: "Rust" },
    ];
    expect(validateField(field("select", { options }), "go")).toEqual([]);
    expect(
      validateField(field("multiselect", { options }), ["go", "rust"]),
    ).toEqual([]);
  });

  it.each([
    ["text", false],
    ["textarea", 3],
    ["email", true],
    ["phone", 12],
    ["date", false],
    ["number", "42"],
    ["boolean", "true"],
    ["select", true],
    ["multiselect", "go"],
  ] satisfies Array<[FieldDefinition["type"], FieldValue]>)(
    "rejects a wrong-shaped %s value",
    (type, value) => {
      expect(codes(field(type), value)).toContain("type_mismatch");
    },
  );

  it.each([null, "", "   ", []] satisfies FieldValue[])(
    "reports required for an empty value (%j)",
    (value) => {
      expect(codes(field("text", { required: true }), value)).toEqual([
        "required",
      ]);
    },
  );

  it("returns immediately for an optional null", () => {
    expect(
      validateField(field("email", { validate: z.string().min(20) }), null),
    ).toEqual([]);
  });

  it("validates email format", () => {
    expect(codes(field("email"), "missing-at.example.com")).toContain(
      "email_format",
    );
  });

  it("validates phone digit count", () => {
    expect(codes(field("phone"), "(555) 12")).toContain("phone_format");
  });

  it("validates date syntax and calendar dates", () => {
    expect(codes(field("date"), "02/29/2024")).toContain("date_format");
    expect(codes(field("date"), "2023-02-29")).toContain("date_format");
  });

  it("validates finite numbers and min/max constraints", () => {
    const definition = field("number", {
      constraints: { min: 10, max: 20 },
    });
    expect(codes(definition, 10)).toEqual([]);
    expect(codes(definition, 9)).toEqual(["range"]);
    expect(codes(definition, 21)).toEqual(["range"]);
    expect(codes(definition, Number.POSITIVE_INFINITY)).toEqual(["range"]);
  });

  it("validates minLength and maxLength constraints", () => {
    const definition = field("text", {
      constraints: { minLength: 2, maxLength: 4 },
    });
    expect(codes(definition, "okay")).toEqual([]);
    expect(codes(definition, "x")).toEqual(["length"]);
    expect(codes(definition, "too long")).toEqual(["length"]);
  });

  it("validates patterns with custom and generic messages", () => {
    const custom = field("text", {
      constraints: { pattern: "^[A-Z]+$", patternMessage: "Use capitals" },
    });
    expect(validateField(custom, "ABC")).toEqual([]);
    expect(validateField(custom, "abc")).toEqual([
      { code: "pattern", message: "Use capitals", severity: "error" },
    ]);
    expect(
      validateField(field("text", { constraints: { pattern: "^x$" } }), "y")[0],
    ).toMatchObject({ code: "pattern", severity: "error" });
  });

  it("validates select membership", () => {
    const definition = field("select", {
      options: [{ value: "go", label: "Go" }],
    });
    expect(codes(definition, "rust")).toEqual(["option"]);
  });

  it("validates every multiselect option and rejects duplicates", () => {
    const definition = field("multiselect", {
      options: [
        { value: "go", label: "Go" },
        { value: "rust", label: "Rust" },
      ],
    });
    expect(codes(definition, ["go", "python"])).toEqual(["option"]);
    expect(codes(definition, ["go", "go"])).toEqual(["option"]);
  });

  it("maps zod issues after built-in issues", () => {
    const definition = field("text", {
      constraints: { minLength: 4 },
      validate: z.string().startsWith("A", "Must start with A"),
    });

    expect(validateField(definition, "no")).toEqual([
      {
        code: "length",
        message: "text has an invalid length",
        severity: "error",
      },
      { code: "custom", message: "Must start with A", severity: "error" },
    ]);
  });
});
