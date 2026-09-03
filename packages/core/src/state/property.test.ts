import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { FieldValue } from "../definition";
import type { FormEvent } from "./events";
import { createInitialState, reduce } from "./reducer";
import { testForm } from "./test-form";
import type { Span } from "./types";

const fieldIds = [
  "fullName",
  "email",
  "linkedin",
  "currentlyEmployed",
  "employer",
  "title",
  "gradYear",
  "yearsExperience",
  "coverNote",
  "workAuthorization",
  "willingToRelocate",
] as const;

const values = fc.oneof(
  fc.constant(null),
  fc.string({ maxLength: 20 }),
  fc.integer({ min: -10, max: 2050 }),
  fc.boolean(),
  fc.array(fc.string({ maxLength: 8 }), { maxLength: 3 }),
) as fc.Arbitrary<FieldValue>;

const span: Span = {
  sourceId: "resume",
  start: 0,
  end: 5,
  quote: "value",
  match: "exact",
};

const fieldId = fc.constantFrom(...fieldIds);
const editEvent = fc.oneof(
  fc.record({
    type: fc.constant("OVERRIDE" as const),
    fieldId,
    value: values,
  }),
  fc.record({
    type: fc.constant("USE_SELECTION" as const),
    fieldId,
    value: values,
    span: fc.constant(span),
  }),
  fc.record({
    type: fc.constant("ANSWER" as const),
    fieldId,
    value: values,
    optionIndex: fc.option(fc.integer({ min: 0, max: 2 }), { nil: undefined }),
  }),
  fc.record({ type: fc.constant("ACCEPT" as const), fieldId }),
  fc.record({ type: fc.constant("REVERT" as const), fieldId }),
  fc.record({
    type: fc.constant("DISMISS_SUGGESTION" as const),
    fieldId,
  }),
  fc.record({
    type: fc.constant("CLEAR_AI" as const),
    fieldId: fc.option(fieldId, { nil: undefined }),
  }),
);

const streamEvent = fc.oneof(
  fc.record({
    type: fc.constant("PROPOSAL_RECEIVED" as const),
    proposal: fc.record({
      id: fc.string({ minLength: 1, maxLength: 8 }),
      fillId: fc.constant("fill-1"),
      fieldId,
      kind: fc.constantFrom("extracted" as const, "inferred" as const),
      value: values,
      span: fc.option(fc.constant(span), { nil: null }),
    }),
  }),
  fc.record({
    type: fc.constant("QUESTION_RECEIVED" as const),
    question: fc.record({
      id: fc.string({ minLength: 1, maxLength: 8 }),
      fillId: fc.constant("fill-1"),
      fieldId,
      text: fc.constant("Choose"),
      options: fc.array(
        fc.record({
          label: fc.string({ maxLength: 8 }),
          value: values,
          span: fc.option(fc.constant(span), { nil: undefined }),
        }),
        { maxLength: 3 },
      ),
      allowFreeText: fc.boolean(),
    }),
  }),
  fc.record({
    type: fc.constant("NO_EVIDENCE" as const),
    fillId: fc.constant("fill-1"),
    fieldId,
  }),
);

const navigationEvent = fc.constantFrom<FormEvent>(
  { type: "REVIEW_START" },
  { type: "REVIEW_NEXT" },
  { type: "REVIEW_SKIP" },
  { type: "REVIEW_PREV" },
  { type: "REVIEW_END" },
  { type: "SUBMIT_REQUESTED" },
  { type: "SUBMIT_SUCCEEDED" },
  { type: "RESET" },
  { type: "FILL_STARTED", fillId: "fill-1", sourceIds: ["resume"] },
  { type: "FILL_FINISHED", fillId: "fill-1" },
);

const event = fc.oneof(
  editEvent,
  streamEvent,
  navigationEvent,
) as fc.Arbitrary<FormEvent>;

function valuesEqual(left: FieldValue, right: FieldValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

describe("state machine properties", () => {
  it("protects human values and preserves value/provenance consistency", () => {
    fc.assert(
      fc.property(
        fc.array(event, { minLength: 30, maxLength: 30 }),
        (events) => {
          let state = reduce(createInitialState(testForm), {
            type: "FILL_STARTED",
            fillId: "fill-1",
            sourceIds: ["resume"],
          });

          for (const nextEvent of events) {
            const before = state;
            state = reduce(state, nextEvent);

            for (const currentFieldId of fieldIds) {
              const beforeField = before.fields[currentFieldId];
              const afterField = state.fields[currentFieldId];
              if (!beforeField || !afterField) {
                throw new Error(`Missing test field ${currentFieldId}`);
              }

              if (
                beforeField.provenance?.kind === "user" ||
                beforeField.provenance?.kind === "answered"
              ) {
                if (nextEvent.type === "CLEAR_AI") {
                  expect(afterField.value).toEqual(beforeField.value);
                }
                if (!valuesEqual(beforeField.value, afterField.value)) {
                  const targetsField =
                    "fieldId" in nextEvent &&
                    nextEvent.fieldId === currentFieldId;
                  expect(
                    nextEvent.type === "RESET" ||
                      (targetsField &&
                        [
                          "OVERRIDE",
                          "USE_SELECTION",
                          "ANSWER",
                          "ACCEPT",
                          "REVERT",
                        ].includes(nextEvent.type)),
                  ).toBe(true);
                }
              }

              if (afterField.value !== null) {
                expect(afterField.provenance).not.toBeNull();
              }
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
