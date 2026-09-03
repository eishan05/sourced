import { describe, expect, expectTypeOf, it } from "vitest";

import { defineForm } from "./define-form";
import type { FieldIds, FormDefinition } from "./types";

function formWith(field: FormDefinition["sections"][number]["fields"][number]) {
  return {
    id: "test",
    title: "Test",
    version: 1,
    sections: [{ id: "main", title: "Main", fields: [field] }],
  } satisfies FormDefinition;
}

describe("defineForm", () => {
  it("accepts a valid example form and preserves literal field ids", () => {
    const form = defineForm({
      id: "example",
      title: "Example",
      version: 1,
      sections: [
        {
          id: "contact",
          title: "Contact",
          fields: [
            { id: "name", type: "text", label: "Name" },
            {
              id: "country",
              type: "select",
              label: "Country",
              options: [{ value: "in", label: "India" }],
            },
          ],
        },
      ],
    });

    type Id = FieldIds<typeof form>;
    expectTypeOf<Id>().toEqualTypeOf<"name" | "country">();
    expect(form.id).toBe("example");
  });

  it("rejects duplicate field ids", () => {
    expect(() =>
      defineForm({
        id: "test",
        title: "Test",
        version: 1,
        sections: [
          {
            id: "one",
            title: "One",
            fields: [{ id: "duplicate", type: "text", label: "First" }],
          },
          {
            id: "two",
            title: "Two",
            fields: [{ id: "duplicate", type: "text", label: "Second" }],
          },
        ],
      }),
    ).toThrow(/duplicate field id "duplicate"/i);
  });

  it("rejects duplicate section ids", () => {
    expect(() =>
      defineForm({
        id: "test",
        title: "Test",
        version: 1,
        sections: [
          { id: "duplicate", title: "One", fields: [] },
          { id: "duplicate", title: "Two", fields: [] },
        ],
      }),
    ).toThrow(/duplicate section id "duplicate"/i);
  });

  it("rejects unknown showWhen targets", () => {
    expect(() =>
      defineForm({
        id: "test",
        title: "Test",
        version: 1,
        sections: [
          {
            id: "main",
            title: "Main",
            showWhen: { field: "missing", truthy: true },
            fields: [{ id: "name", type: "text", label: "Name" }],
          },
        ],
      }),
    ).toThrow(/section "main".*unknown field "missing"/i);
  });

  it("rejects fields whose showWhen references themselves", () => {
    expect(() =>
      defineForm({
        id: "test",
        title: "Test",
        version: 1,
        sections: [
          {
            id: "main",
            title: "Main",
            fields: [
              {
                id: "loop",
                type: "boolean",
                label: "Loop",
                showWhen: { field: "loop", truthy: true },
              },
            ],
          },
        ],
      }),
    ).toThrow(/field "loop".*itself/i);
  });

  it("rejects missing select options", () => {
    expect(() =>
      defineForm(formWith({ id: "country", type: "select", label: "Country" })),
    ).toThrow(/field "country".*at least one option/i);
  });

  it("rejects options on a text field", () => {
    expect(() =>
      defineForm(
        formWith({
          id: "name",
          type: "text",
          label: "Name",
          options: [{ value: "a", label: "A" }],
        }),
      ),
    ).toThrow(/field "name".*must not define options/i);
  });

  it("rejects duplicate option values", () => {
    expect(() =>
      defineForm(
        formWith({
          id: "country",
          type: "select",
          label: "Country",
          options: [
            { value: "in", label: "India" },
            { value: "in", label: "India again" },
          ],
        }),
      ),
    ).toThrow(/field "country".*duplicate option value "in"/i);
  });

  it("rejects inapplicable constraints", () => {
    expect(() =>
      defineForm(
        formWith({
          id: "name",
          type: "text",
          label: "Name",
          constraints: { min: 1 },
        }),
      ),
    ).toThrow(/field "name".*constraint "min"/i);
  });

  it("returns the same deeply frozen object", () => {
    const input = {
      id: "test",
      title: "Test",
      version: 1,
      sections: [
        {
          id: "main",
          title: "Main",
          fields: [
            {
              id: "country",
              type: "select" as const,
              label: "Country",
              options: [{ value: "in", label: "India" }],
              showWhen: { field: "enabled", truthy: true } as const,
            },
            { id: "enabled", type: "boolean" as const, label: "Enabled" },
          ],
        },
      ],
    };

    const form = defineForm(input);

    expect(form).toBe(input);
    expect(Object.isFrozen(form)).toBe(true);
    expect(Object.isFrozen(form.sections)).toBe(true);
    expect(Object.isFrozen(form.sections[0])).toBe(true);
    expect(Object.isFrozen(form.sections[0]?.fields)).toBe(true);
    expect(Object.isFrozen(form.sections[0]?.fields[0]?.options)).toBe(true);
    expect(Object.isFrozen(form.sections[0]?.fields[0]?.options?.[0])).toBe(
      true,
    );
    expect(Object.isFrozen(form.sections[0]?.fields[0]?.showWhen)).toBe(true);
  });
});
