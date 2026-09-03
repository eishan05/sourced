import { describe, expect, it } from "vitest";

import { coerceItem } from "./coerce";
import { makeContext } from "./test-helpers";

describe("coerceItem", () => {
  it("coerces a month to its first day with an explanation", () => {
    const result = coerceItem(
      {
        kind: "proposal",
        fieldId: "start",
        basis: "extracted",
        raw: "Mar 2021",
      },
      makeContext(),
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        value: "2021-03-01",
        normalization: {
          raw: "Mar 2021",
          explanation: "Read 'Mar 2021' as 2021-03-01",
        },
      },
    });
  });

  it("matches select labels", () => {
    const result = coerceItem(
      {
        kind: "proposal",
        fieldId: "role",
        basis: "extracted",
        raw: "Engineer",
      },
      makeContext(),
    );
    expect(result).toMatchObject({ ok: true, value: { value: "engineer" } });
  });

  it("coerces multiselect values", () => {
    const result = coerceItem(
      {
        kind: "proposal",
        fieldId: "skills",
        basis: "extracted",
        raw: ["TypeScript", "node-js"],
      },
      makeContext(),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { value: ["typescript", "node-js"] },
    });
  });

  it("formats a US phone number", () => {
    const result = coerceItem(
      {
        kind: "proposal",
        fieldId: "phone",
        basis: "extracted",
        raw: "4155550101",
      },
      makeContext(),
    );
    expect(result).toMatchObject({
      ok: true,
      value: { value: "+1 (415) 555-0101" },
    });
  });

  it("drops values the normalizer cannot read", () => {
    expect(
      coerceItem(
        {
          kind: "proposal",
          fieldId: "role",
          basis: "inferred",
          raw: "Astronaut",
        },
        makeContext(),
      ),
    ).toMatchObject({
      ok: false,
      event: { type: "dropped", reason: "invalid_value" },
    });
  });
});
