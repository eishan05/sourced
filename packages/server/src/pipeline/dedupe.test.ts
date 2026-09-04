import type { FillEvent, Proposal } from "@sourced/core";
import { describe, expect, it } from "vitest";

import { dedupe } from "./dedupe";

function event(id: string, value: string): FillEvent {
  return {
    type: "proposal",
    proposal: {
      id,
      fillId: "fill",
      fieldId: "name",
      kind: "inferred",
      value,
      span: null,
    },
  };
}

describe("dedupe", () => {
  it("emits the later proposal and records it as the winner", () => {
    const previous = new Map<string, Proposal>();
    const first = dedupe(event("one", "Ada"), previous);
    const second = dedupe(event("two", "Grace"), first.proposalsByField);
    expect(second.event).toEqual(event("two", "Grace"));
    expect(second.proposalsByField.get("name")?.value).toBe("Grace");
  });
});
