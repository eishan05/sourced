import { describe, expect, it } from "vitest";

import {
  evaluateCondition,
  fieldById,
  fieldsOf,
  isFieldVisible,
  policyOf,
} from "./conditions";
import type { FieldValue, FormDefinition } from "./types";

describe("definition helpers", () => {
  const form = {
    id: "visibility",
    title: "Visibility",
    version: 1,
    sections: [
      {
        id: "conditional",
        title: "Conditional",
        showWhen: { field: "enabled", truthy: true },
        fields: [
          {
            id: "detail",
            type: "text",
            label: "Detail",
            showWhen: { field: "mode", equals: "full" },
          },
        ],
      },
      {
        id: "controls",
        title: "Controls",
        fields: [
          { id: "enabled", type: "boolean", label: "Enabled" },
          { id: "mode", type: "text", label: "Mode", policy: "infer" },
        ],
      },
    ],
  } satisfies FormDefinition;

  it("flattens and finds fields in definition order", () => {
    expect(fieldsOf(form).map((field) => field.id)).toEqual([
      "detail",
      "enabled",
      "mode",
    ]);
    expect(fieldById(form, "mode")?.label).toBe("Mode");
    expect(fieldById(form, "missing")).toBeUndefined();
    const enabled = fieldById(form, "enabled");
    const mode = fieldById(form, "mode");
    if (!enabled || !mode) {
      throw new Error("Expected control fields to exist");
    }
    expect(policyOf(enabled)).toBe("extract");
    expect(policyOf(mode)).toBe("infer");
  });

  it("evaluates equals with strict scalar and deep array equality", () => {
    expect(evaluateCondition({ field: "count", equals: 2 }, { count: 2 })).toBe(
      true,
    );
    expect(
      evaluateCondition({ field: "count", equals: "2" }, { count: 2 }),
    ).toBe(false);
    expect(
      evaluateCondition(
        { field: "skills", equals: ["go", "sql"] },
        { skills: ["go", "sql"] },
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { field: "skills", equals: ["sql", "go"] },
        { skills: ["go", "sql"] },
      ),
    ).toBe(false);
  });

  it("evaluates in including array candidates", () => {
    expect(
      evaluateCondition(
        { field: "mode", in: ["simple", "full"] },
        { mode: "full" },
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { field: "skills", in: [["go"], ["go", "sql"]] },
        { skills: ["go", "sql"] },
      ),
    ).toBe(true);
  });

  it("uses the specified truthiness rules and negates them", () => {
    const truthyValues: FieldValue[] = [true, 1, -1, " yes ", ["go"]];
    const falsyValues: FieldValue[] = [false, 0, "   ", [], null];

    for (const value of truthyValues) {
      expect(
        evaluateCondition({ field: "value", truthy: true }, { value }),
      ).toBe(true);
    }
    for (const value of falsyValues) {
      expect(
        evaluateCondition({ field: "value", truthy: false }, { value }),
      ).toBe(true);
    }
  });

  it("treats missing values as null", () => {
    expect(evaluateCondition({ field: "missing", equals: null }, {})).toBe(
      true,
    );
    expect(evaluateCondition({ field: "missing", truthy: true }, {})).toBe(
      false,
    );
  });

  it("recurses through nested all and any conditions", () => {
    expect(
      evaluateCondition(
        {
          all: [
            { field: "enabled", equals: true },
            {
              any: [
                { field: "mode", equals: "full" },
                { field: "admin", equals: true },
              ],
            },
          ],
        },
        { enabled: true, mode: "full" },
      ),
    ).toBe(true);
    expect(evaluateCondition({ all: [] }, {})).toBe(true);
    expect(evaluateCondition({ any: [] }, {})).toBe(false);
  });

  it("checks both section-level and field-level visibility", () => {
    expect(
      isFieldVisible(form, "detail", { enabled: false, mode: "full" }),
    ).toBe(false);
    expect(
      isFieldVisible(form, "detail", { enabled: true, mode: "short" }),
    ).toBe(false);
    expect(
      isFieldVisible(form, "detail", { enabled: true, mode: "full" }),
    ).toBe(true);
    expect(isFieldVisible(form, "missing", {})).toBe(false);
  });
});
