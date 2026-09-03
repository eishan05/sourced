import { describe, expect, it } from "vitest";

import type { FormEvent } from "./events";
import { createInitialState, reduce } from "./reducer";
import { reviewCursorFieldId } from "./selectors";
import { testForm } from "./test-form";
import type { FormState, Proposal } from "./types";

function extracted(fieldId: string, value: Proposal["value"]): Proposal {
  return {
    id: `p-${fieldId}`,
    fillId: "fill-1",
    fieldId,
    kind: "extracted",
    value,
    span: null,
  };
}

function run(
  events: FormEvent[],
  start = createInitialState(testForm),
): FormState {
  return events.reduce(reduce, start);
}

describe("REVIEW_PREV skips entries that became hidden", () => {
  it("lands on the nearest visible earlier entry", () => {
    let state = run([
      { type: "FILL_STARTED", fillId: "fill-1", sourceIds: [] },
      {
        type: "PROPOSAL_RECEIVED",
        proposal: extracted("currentlyEmployed", true),
      },
      { type: "PROPOSAL_RECEIVED", proposal: extracted("employer", "Acme") },
      { type: "PROPOSAL_RECEIVED", proposal: extracted("gradYear", 2017) },
      { type: "REVIEW_START" },
      { type: "REVIEW_GOTO", fieldId: "gradYear" },
    ]);
    expect(state.review.order).toEqual([
      "currentlyEmployed",
      "employer",
      "gradYear",
    ]);

    state = reduce(state, {
      type: "OVERRIDE",
      fieldId: "currentlyEmployed",
      value: false,
    });
    state = reduce(state, { type: "REVIEW_PREV" });
    expect(reviewCursorFieldId(state)).toBe("currentlyEmployed");

    const unchanged = reduce(state, { type: "REVIEW_PREV" });
    expect(unchanged).toBe(state);
  });

  it("stays put when every earlier entry is hidden", () => {
    let state = run([
      { type: "FILL_STARTED", fillId: "fill-1", sourceIds: [] },
      {
        type: "PROPOSAL_RECEIVED",
        proposal: extracted("currentlyEmployed", true),
      },
      { type: "ACCEPT", fieldId: "currentlyEmployed" },
      { type: "PROPOSAL_RECEIVED", proposal: extracted("employer", "Acme") },
      { type: "PROPOSAL_RECEIVED", proposal: extracted("gradYear", 2017) },
      { type: "REVIEW_START" },
      { type: "REVIEW_GOTO", fieldId: "gradYear" },
    ]);
    expect(state.review.order).toEqual(["employer", "gradYear"]);

    state = reduce(state, {
      type: "OVERRIDE",
      fieldId: "currentlyEmployed",
      value: false,
    });
    const after = reduce(state, { type: "REVIEW_PREV" });
    expect(after).toBe(state);
    expect(reviewCursorFieldId(after)).toBe("gradYear");
  });
});
