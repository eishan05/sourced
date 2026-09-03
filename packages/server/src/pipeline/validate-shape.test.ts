import { describe, expect, it } from "vitest";

import { makeContext } from "./test-helpers";
import { validateShape } from "./validate-shape";

describe("validateShape", () => {
  it("drops unknown fields", () => {
    const result = validateShape(
      { kind: "proposal", fieldId: "missing", basis: "inferred", value: "x" },
      makeContext(),
    );
    expect(result).toMatchObject({
      ok: false,
      event: { type: "dropped", reason: "unknown_field" },
    });
  });

  it("drops human-policy fields", () => {
    const result = validateShape(
      { kind: "no_evidence", fieldId: "human" },
      makeContext(),
    );
    expect(result).toMatchObject({
      ok: false,
      event: { type: "dropped", reason: "policy_human" },
    });
  });

  it("drops malformed proposals and flags with an unknown id", () => {
    expect(
      validateShape({ kind: "proposal", fieldId: "name" }, makeContext()),
    ).toMatchObject({
      ok: false,
      event: { reason: "malformed" },
    });
    expect(
      validateShape(
        {
          kind: "flag",
          fieldIds: ["name", "missing"],
          message: "Mismatch",
          severity: "warning",
        },
        makeContext(),
      ),
    ).toMatchObject({
      ok: false,
      event: { reason: "unknown_field", fieldId: "missing" },
    });
  });

  it("passes no_evidence through", () => {
    expect(
      validateShape({ kind: "no_evidence", fieldId: "name" }, makeContext()),
    ).toEqual({
      ok: true,
      value: { kind: "no_evidence", fieldId: "name" },
    });
  });
});
