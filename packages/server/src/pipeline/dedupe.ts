import type { FillEvent, Proposal } from "@ai-native-forms/core";

export interface DedupeResult {
  event: FillEvent;
  proposalsByField: ReadonlyMap<string, Proposal>;
}

export function dedupe(
  event: FillEvent,
  previous: ReadonlyMap<string, Proposal>,
): DedupeResult {
  if (event.type !== "proposal") {
    return { event, proposalsByField: previous };
  }
  const proposalsByField = new Map(previous);
  proposalsByField.set(event.proposal.fieldId, event.proposal);
  return { event, proposalsByField };
}
