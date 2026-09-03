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
