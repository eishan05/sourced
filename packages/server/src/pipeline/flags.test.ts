import { describe, expect, it } from "vitest";

import { finalizeFlag } from "./flags";
import { makeContext } from "./test-helpers";

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
});
