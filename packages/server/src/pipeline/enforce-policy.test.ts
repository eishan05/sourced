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
        question: "Is your Name Ada? I couldn't find it stated verbatim.",
        options: [{ label: "Ada", value: "Ada" }],
        allowFreeText: true,
      },
    });
  });
});
