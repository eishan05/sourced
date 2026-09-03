import { describe, expect, it } from "vitest";

import { finalizeFlag } from "./flags";
import { makeContext } from "./test-helpers";
import { validateShape } from "./validate-shape";

describe("finalizeFlag", () => {
  it("assigns server ids and fill ids", () => {
    expect(
      finalizeFlag(
        {
          kind: "flag",
          fieldIds: ["name"],
          message: "Names differ",
          severity: "error",
        },
        makeContext(),
      ),
    ).toMatchObject({
      type: "flag",
      flag: { id: "id-1", fillId: "fill-1", severity: "error" },
    });
  });

  it("rejects a flag when any referenced field id is invalid", () => {
    expect(
      validateShape(
        {
          kind: "flag",
          fieldIds: ["name", "missing"],
          message: "Values conflict",
          severity: "error",
        },
        makeContext(),
      ),
    ).toMatchObject({
      ok: false,
      event: { type: "dropped", reason: "unknown_field", fieldId: "missing" },
    });
  });
});
