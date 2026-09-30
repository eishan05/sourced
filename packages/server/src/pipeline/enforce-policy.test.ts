import type { FieldValue, SerializedFieldDefinition } from "@sourced/core";
import { describe, expect, it } from "vitest";

import { enforcePolicy } from "./enforce-policy";
import { makeContext } from "./test-helpers";

const span = {
  sourceId: "resume",
  start: 0,
  end: 12,
  quote: "Ada Lovelace",
  match: "exact" as const,
};

describe("enforcePolicy", () => {
  const choices = [
    { value: "go", label: "Go" },
    { value: "node-js", label: "Node.js" },
  ];
  it.each<[SerializedFieldDefinition["type"], FieldValue, string, boolean]>([
    ["number", 99, "Age: 25", false],
    ["number", 99, "25", false],
    ["number", 25, "25", true],
    ["number", 1234.5, "$1,234.50", true],
    ["number", -0.5, "-.5", true],
    ["number", 25, "25 to 99", false],
    ["number", 25, "125", false],
    ["number", 9, "Nine years", false],
    ["date", "2021-03-01", "Mar 2021", true],
    ["date", "2026-08-20", "Aug 20", true],
    ["date", "2026-09-02", "yesterday", true],
    ["date", "2021-04-01", "Mar 2021", false],
    ["date", "2021-03-01", "Started Mar 2021", false],
    ["date", "2021-03-01", "Mar 2021 to Apr 2022", false],
    ["boolean", true, "YES", true],
    ["boolean", false, "no", true],
    ["boolean", true, "no", false],
    ["boolean", true, "Present", false],
    ["boolean", true, "not true", false],
    ["select", "node-js", "Node.js", true],
    ["select", "go", "Django", false],
    ["select", "go", "No Go experience", false],
    ["multiselect", ["go", "node-js"], "Go; Node.js", true],
    ["multiselect", ["go"], "Go, Node.js", true],
    ["multiselect", ["go", "node-js"], "Go", false],
    ["multiselect", ["go"], "Django", false],
    ["multiselect", ["go"], "No Go experience", false],
  ])(
    "checks %s value %j against %j (supported: %s)",
    (type, value, quote, supported) => {
      const field: SerializedFieldDefinition = {
        id: "checked",
        label: "Checked",
        type,
        options: choices,
      };
      for (const policy of ["infer", "extract"] as const) {
        const result = enforcePolicy(
          {
            kind: "proposal",
            fieldId: field.id,
            basis: "extracted",
            raw: String(value),
            value,
            span: { ...span, quote },
          },
          makeContext({
            fieldsById: new Map([[field.id, { ...field, policy }]]),
          }),
        );
        expect(result).toMatchObject({
          ok: true,
          value: supported
            ? { kind: "proposal", basis: "extracted" }
            : policy === "infer"
              ? { kind: "proposal", basis: "inferred" }
              : { kind: "question" },
        });
      }
    },
  );

  it("shows normalization derived from the actual date evidence", () => {
    expect(
      enforcePolicy(
        {
          kind: "proposal",
          fieldId: "start",
          basis: "extracted",
          raw: "2021-03-01",
          value: "2021-03-01",
          span: { ...span, quote: "Mar 2021" },
        },
        makeContext(),
      ),
    ).toMatchObject({
      ok: true,
      value: {
        normalization: {
          raw: "Mar 2021",
          explanation: "Read 'Mar 2021' as 2021-03-01",
        },
      },
    });
  });
  it("downgrades an unlocatable extracted proposal", () => {
    const result = enforcePolicy(
      {
        kind: "proposal",
        fieldId: "bio",
        basis: "extracted",
        raw: "Writer",
        value: "Writer",
        span: null,
      },
      makeContext(),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { kind: "proposal", basis: "inferred" },
    });
  });

  it("downgrades extracted text absent from its quote", () => {
    const result = enforcePolicy(
      {
        kind: "proposal",
        fieldId: "bio",
        basis: "extracted",
        raw: "Engineer",
        value: "Engineer",
        span,
      },
      makeContext(),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { kind: "proposal", basis: "inferred" },
    });
  });

  it("keeps a normalized phone extracted when its digits match the quote", () => {
    const result = enforcePolicy(
      {
        kind: "proposal",
        fieldId: "phone",
        basis: "extracted",
        raw: "+14155550101",
        value: "+1 (415) 555-0101",
        span: { ...span, quote: "+1 (415) 555-0101" },
      },
      makeContext(),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { kind: "proposal", basis: "extracted" },
    });
  });

  it("keeps an email extracted when casing differs from the quote", () => {
    const result = enforcePolicy(
      {
        kind: "proposal",
        fieldId: "email",
        basis: "extracted",
        raw: "ada@example.com",
        value: "ada@example.com",
        span: { ...span, quote: " ADA@EXAMPLE.COM " },
      },
      makeContext(),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { kind: "proposal", basis: "extracted" },
    });
  });

  it("converts inferred values for extract-only fields to a question", () => {
    const result = enforcePolicy(
      {
        kind: "proposal",
        fieldId: "name",
        basis: "inferred",
        raw: "Ada",
        value: "Ada",
        span: null,
      },
      makeContext(),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        kind: "question",
        fieldId: "name",
        question:
          'I read "Name" as Ada, but couldn\'t find it stated verbatim. Is that right?',
        options: [{ label: "Ada", value: "Ada" }],
        allowFreeText: true,
      },
    });
  });

  it("uses Yes and No for an inferred boolean on an extract-only field", () => {
    const result = enforcePolicy(
      {
        kind: "proposal",
        fieldId: "employed",
        basis: "inferred",
        raw: "true",
        value: true,
        span: null,
      },
      makeContext(),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        kind: "question",
        fieldId: "employed",
        question:
          'I read "Currently employed" as Yes, but couldn\'t find it stated verbatim. Is that right?',
        options: [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ],
        allowFreeText: false,
      },
    });
  });

  it("uses the select label and offers another answer", () => {
    const result = enforcePolicy(
      {
        kind: "proposal",
        fieldId: "workMode",
        basis: "inferred",
        raw: "remote",
        value: "remote",
        span: null,
      },
      makeContext(),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        kind: "question",
        fieldId: "workMode",
        question:
          'I read "Work mode" as Remote, but couldn\'t find it stated verbatim. Is that right?',
        options: [
          { label: "Remote", value: "remote" },
          { label: "Something else", value: "" },
        ],
        allowFreeText: true,
      },
    });
  });
});
