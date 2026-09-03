import { describe, expect, it } from "vitest";

import { finalizeQuestion } from "./questions";
import { makeContext } from "./test-helpers";

describe("finalizeQuestion", () => {
  const question = {
    kind: "question" as const,
    fieldId: "name",
    question: "Which name?",
    options: [
      {
        label: "Ada",
        value: "Ada Lovelace",
        sourceId: "resume",
        quote: "Ada Lovelace",
      },
    ],
    allowFreeText: true,
  };

  it("locates option quotes and assigns an id", () => {
    const result = finalizeQuestion(question, makeContext(), 0);
    expect(result).toMatchObject({
      ok: true,
      value: {
        type: "question",
        question: {
          id: "id-1",
          options: [{ span: { sourceId: "resume", quote: "Ada Lovelace" } }],
        },
      },
    });
  });

  it("caps questions per fill", () => {
    expect(finalizeQuestion(question, makeContext(), 5, 5)).toMatchObject({
      ok: false,
      event: {
        type: "dropped",
        reason: "malformed",
        detail: "question limit",
      },
    });
  });
});
