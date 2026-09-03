import { describe, expect, it } from "vitest";

import { defineForm, type FieldValue } from "../definition";
import type { FormEvent } from "./events";
import { createInitialState, reduce } from "./reducer";
import {
  hiddenReason,
  highlightsForSource,
  reviewCursorFieldId,
  submitBlockers,
  submitSummary,
} from "./selectors";
import { testForm } from "./test-form";
import type { FieldState, FormState, Proposal, Question, Span } from "./types";

const source = {
  id: "resume",
  name: "Resume",
  kind: "paste" as const,
  text: "Priya Raman Acme Corp nine years",
  addedAt: 1,
};

function span(start = 0, quote = "Priya Raman"): Span {
  return {
    sourceId: source.id,
    start,
    end: start + quote.length,
    quote,
    match: "exact",
  };
}

function proposal(
  fieldId: string,
  kind: Proposal["kind"],
  value: FieldValue,
  id = `${fieldId}-${kind}`,
): Proposal {
  return {
    id,
    fillId: "fill-1",
    fieldId,
    kind,
    value,
    span: kind === "extracted" ? span() : null,
  };
}

function question(fieldId: string, id = `${fieldId}-question`): Question {
  return {
    id,
    fillId: "fill-1",
    fieldId,
    text: "Which value is correct?",
    options: [
      { label: "Acme", value: "Acme Corp", span: span(12, "Acme Corp") },
    ],
    allowFreeText: true,
  };
}

function started(initialValues?: Record<string, FieldValue>): FormState {
  return reduce(createInitialState(testForm, initialValues), {
    type: "FILL_STARTED",
    fillId: "fill-1",
    sourceIds: [source.id],
  });
}

function fieldResult(field: FieldState) {
  return {
    value: field.value,
    provenanceKind: field.provenance?.kind ?? null,
    reviewStatus: field.reviewStatus,
    suggestion: field.suggestion?.id ?? null,
    question: field.question?.id ?? null,
  };
}

function eventFieldId(event: FormEvent): string | null {
  if ("fieldId" in event) {
    return event.fieldId ?? null;
  }
  if (event.type === "PROPOSAL_RECEIVED") {
    return event.proposal.fieldId;
  }
  if (event.type === "QUESTION_RECEIVED") {
    return event.question.fieldId;
  }
  return null;
}

describe("createInitialState", () => {
  it("serializes the definition and applies validated owner prefills", () => {
    const state = createInitialState(testForm, {
      fullName: "Priya Raman",
      email: "not-an-email",
    });

    expect(state.fields.fullName).toMatchObject({
      value: "Priya Raman",
      provenance: { kind: "prefill" },
      reviewStatus: "none",
      issues: [],
    });
    expect(state.fields.email?.issues.map((issue) => issue.code)).toEqual([
      "email_format",
    ]);
    expect(state.fields.employer).toEqual({
      value: null,
      provenance: null,
      reviewStatus: "none",
      suggestion: null,
      question: null,
      previous: null,
      issues: [],
    });
    expect(state.definition).not.toBe(testForm);
  });

  it("throws for an unknown prefill id", () => {
    expect(() => createInitialState(testForm, { missing: "value" })).toThrow(
      /unknown initial value field id "missing"/i,
    );
  });
});

describe("field issues", () => {
  it("recomputes validation errors and suspicious warnings together", () => {
    const form = defineForm({
      id: "suspicious-values",
      title: "Suspicious values",
      version: 1,
      sections: [
        {
          id: "identity",
          title: "Identity",
          fields: [
            {
              id: "employeeId",
              type: "text",
              label: "Employee ID",
              constraints: {
                pattern: "^\\d{9}$",
                patternMessage: "Employee ID must be exactly 9 digits",
              },
            },
          ],
        },
      ],
    });

    const state = reduce(createInitialState(form), {
      type: "OVERRIDE",
      fieldId: "employeeId",
      value: "12345678",
    });

    expect(state.fields.employeeId?.issues).toEqual([
      {
        code: "pattern",
        message: "Employee ID must be exactly 9 digits",
        severity: "error",
      },
      {
        code: "suspicious_length",
        message: "Looks one digit short",
        severity: "warning",
      },
    ]);
    expect(submitBlockers(state)).toEqual([
      { reason: "invalid", fieldId: "employeeId" },
    ]);
  });
});

describe("field transition table", () => {
  it.each([
    {
      name: "extracted proposal fills an untouched field",
      prepare: () => started(),
      event: {
        type: "PROPOSAL_RECEIVED",
        proposal: proposal("fullName", "extracted", "Priya Raman"),
      } satisfies FormEvent,
      expected: {
        value: "Priya Raman",
        provenanceKind: "extracted",
        reviewStatus: "pending",
        suggestion: null,
        question: null,
      },
    },
    {
      name: "inferred proposal remains a ghost suggestion",
      prepare: () => started(),
      event: {
        type: "PROPOSAL_RECEIVED",
        proposal: proposal("yearsExperience", "inferred", 9),
      } satisfies FormEvent,
      expected: {
        value: null,
        provenanceKind: null,
        reviewStatus: "none",
        suggestion: "yearsExperience-inferred",
        question: null,
      },
    },
    {
      name: "accept promotes a suggestion",
      prepare: () =>
        reduce(started(), {
          type: "PROPOSAL_RECEIVED",
          proposal: proposal("yearsExperience", "inferred", 9),
        }),
      event: { type: "ACCEPT", fieldId: "yearsExperience" } satisfies FormEvent,
      expected: {
        value: 9,
        provenanceKind: "inferred",
        reviewStatus: "accepted",
        suggestion: null,
        question: null,
      },
    },
    {
      name: "accept marks extracted value reviewed",
      prepare: () =>
        reduce(started(), {
          type: "PROPOSAL_RECEIVED",
          proposal: proposal("fullName", "extracted", "Priya Raman"),
        }),
      event: { type: "ACCEPT", fieldId: "fullName" } satisfies FormEvent,
      expected: {
        value: "Priya Raman",
        provenanceKind: "extracted",
        reviewStatus: "accepted",
        suggestion: null,
        question: null,
      },
    },
    {
      name: "override replaces AI value and closes review items",
      prepare: () =>
        reduce(
          reduce(started(), {
            type: "PROPOSAL_RECEIVED",
            proposal: proposal("fullName", "extracted", "Priya Raman"),
          }),
          { type: "QUESTION_RECEIVED", question: question("fullName") },
        ),
      event: {
        type: "OVERRIDE",
        fieldId: "fullName",
        value: "Priya R.",
      } satisfies FormEvent,
      expected: {
        value: "Priya R.",
        provenanceKind: "user",
        reviewStatus: "overridden",
        suggestion: null,
        question: null,
      },
    },
    {
      name: "answer resolves an open question",
      prepare: () =>
        reduce(started(), {
          type: "QUESTION_RECEIVED",
          question: question("employer"),
        }),
      event: {
        type: "ANSWER",
        fieldId: "employer",
        value: "Acme Corp",
        optionIndex: 0,
      } satisfies FormEvent,
      expected: {
        value: "Acme Corp",
        provenanceKind: "answered",
        reviewStatus: "accepted",
        suggestion: null,
        question: null,
      },
    },
    {
      name: "dismiss removes only the suggestion",
      prepare: () =>
        reduce(started({ yearsExperience: 4 }), {
          type: "PROPOSAL_RECEIVED",
          proposal: proposal("yearsExperience", "inferred", 9),
        }),
      event: {
        type: "DISMISS_SUGGESTION",
        fieldId: "yearsExperience",
      } satisfies FormEvent,
      expected: {
        value: 4,
        provenanceKind: "prefill",
        reviewStatus: "none",
        suggestion: null,
        question: null,
      },
    },
    {
      name: "revert restores the prior AI value",
      prepare: () => {
        const extracted = reduce(started(), {
          type: "PROPOSAL_RECEIVED",
          proposal: proposal("fullName", "extracted", "Priya Raman"),
        });
        return reduce(extracted, {
          type: "OVERRIDE",
          fieldId: "fullName",
          value: "Priya R.",
        });
      },
      event: { type: "REVERT", fieldId: "fullName" } satisfies FormEvent,
      expected: {
        value: "Priya Raman",
        provenanceKind: "extracted",
        reviewStatus: "pending",
        suggestion: null,
        question: null,
      },
    },
    {
      name: "selection records user provenance",
      prepare: () => started(),
      event: {
        type: "USE_SELECTION",
        fieldId: "fullName",
        value: "Priya Raman",
        span: span(),
      } satisfies FormEvent,
      expected: {
        value: "Priya Raman",
        provenanceKind: "user",
        reviewStatus: "overridden",
        suggestion: null,
        question: null,
      },
    },
    {
      name: "empty override clears the field",
      prepare: () => started({ fullName: "Priya Raman" }),
      event: {
        type: "OVERRIDE",
        fieldId: "fullName",
        value: "  ",
      } satisfies FormEvent,
      expected: {
        value: null,
        provenanceKind: null,
        reviewStatus: "none",
        suggestion: null,
        question: null,
      },
    },
  ])("$name", ({ prepare, event, expected }) => {
    const next = reduce(prepare(), event);
    const fieldId = eventFieldId(event);
    const field = fieldId ? next.fields[fieldId] : undefined;
    if (!field) {
      throw new Error("Expected table event to target a known field");
    }
    expect(fieldResult(field)).toEqual(expected);
  });
});

describe("trust invariants", () => {
  it("carries proposal normalization into client provenance", () => {
    const state = reduce(started(), {
      type: "PROPOSAL_RECEIVED",
      proposal: {
        ...proposal("gradYear", "extracted", 2021),
        normalization: {
          raw: "2,021",
          explanation: "Read '2,021' as 2021",
        },
      },
    });

    expect(state.fields.gradYear?.provenance?.normalization).toEqual({
      raw: "2,021",
      explanation: "Read '2,021' as 2021",
    });
  });

  it("tracks fill lifecycle, counters, and deduplicated no-evidence events", () => {
    let state = started();
    state = reduce(state, {
      type: "PROPOSAL_RECEIVED",
      proposal: proposal("fullName", "extracted", "Priya Raman"),
    });
    state = reduce(state, {
      type: "QUESTION_RECEIVED",
      question: question("employer"),
    });
    state = reduce(state, {
      type: "FLAG_RECEIVED",
      flag: {
        id: "warning",
        fillId: "fill-1",
        fieldIds: ["employer"],
        message: "Check employer",
        severity: "warning",
      },
    });
    state = reduce(state, {
      type: "NO_EVIDENCE",
      fillId: "fill-1",
      fieldId: "title",
    });
    state = reduce(state, {
      type: "NO_EVIDENCE",
      fillId: "fill-1",
      fieldId: "title",
    });

    expect(state.fills["fill-1"]).toMatchObject({
      status: "streaming",
      counts: { proposals: 1, questions: 1, flags: 1 },
      noEvidenceFieldIds: ["title"],
    });
    state = reduce(state, {
      type: "FILL_FAILED",
      fillId: "fill-1",
      error: "offline",
    });
    expect(state.fills["fill-1"]).toMatchObject({
      status: "error",
      error: "offline",
      counts: { proposals: 1, questions: 1, flags: 1 },
    });
    expect(state.activeFillId).toBeNull();
    state = reduce(state, { type: "FILL_FINISHED", fillId: "fill-1" });
    expect(state.fills["fill-1"]?.status).toBe("done");
    expect(state.fills["fill-1"]).not.toHaveProperty("error");
  });

  it.each(["accepted", "overridden", "answered"] as const)(
    "a proposal becomes a suggestion for an %s field",
    (status) => {
      let state = started();
      if (status === "answered") {
        state = reduce(state, {
          type: "QUESTION_RECEIVED",
          question: question("fullName"),
        });
        state = reduce(state, {
          type: "ANSWER",
          fieldId: "fullName",
          value: "Human answer",
        });
      } else {
        state = reduce(state, {
          type: "PROPOSAL_RECEIVED",
          proposal: proposal("fullName", "extracted", "First value", "first"),
        });
        state = reduce(
          state,
          status === "accepted"
            ? { type: "ACCEPT", fieldId: "fullName" }
            : {
                type: "OVERRIDE",
                fieldId: "fullName",
                value: "Human value",
              },
        );
      }
      const before = state.fields.fullName?.value;

      state = reduce(state, {
        type: "PROPOSAL_RECEIVED",
        proposal: proposal("fullName", "extracted", "Later AI", "later"),
      });

      expect(state.fields.fullName?.value).toBe(before);
      expect(state.fields.fullName?.suggestion?.id).toBe("later");
    },
  );

  it("human-policy fields ignore proposals and questions", () => {
    const initial = started();
    const proposed = reduce(initial, {
      type: "PROPOSAL_RECEIVED",
      proposal: proposal("workAuthorization", "extracted", "citizen"),
    });
    const questioned = reduce(proposed, {
      type: "QUESTION_RECEIVED",
      question: question("workAuthorization"),
    });

    expect(proposed).toBe(initial);
    expect(questioned).toBe(initial);
    expect(initial.fills["fill-1"]?.counts).toEqual({
      proposals: 0,
      questions: 0,
      flags: 0,
    });
  });

  it("a later extracted proposal replaces a still-pending value", () => {
    let state = started();
    state = reduce(state, {
      type: "PROPOSAL_RECEIVED",
      proposal: proposal("fullName", "extracted", "First", "first"),
    });
    state = reduce(state, {
      type: "PROPOSAL_RECEIVED",
      proposal: proposal("fullName", "extracted", "Last", "last"),
    });

    expect(state.fields.fullName).toMatchObject({
      value: "Last",
      provenance: { kind: "extracted", proposalId: "last" },
      reviewStatus: "pending",
    });
    expect(state.fills["fill-1"]?.counts.proposals).toBe(2);
  });

  it("CLEAR_AI keeps human, answered, and prefilled values and clears flags", () => {
    let state = started({ email: "priya@example.com" });
    state = reduce(state, {
      type: "PROPOSAL_RECEIVED",
      proposal: proposal("fullName", "extracted", "Priya Raman"),
    });
    state = reduce(state, {
      type: "OVERRIDE",
      fieldId: "fullName",
      value: "Priya R.",
    });
    state = reduce(state, {
      type: "QUESTION_RECEIVED",
      question: question("employer"),
    });
    state = reduce(state, {
      type: "ANSWER",
      fieldId: "employer",
      value: "Acme Corp",
      optionIndex: 0,
    });
    state = reduce(state, {
      type: "PROPOSAL_RECEIVED",
      proposal: proposal("gradYear", "extracted", 2017),
    });
    state = reduce(state, {
      type: "PROPOSAL_RECEIVED",
      proposal: proposal("yearsExperience", "inferred", 9),
    });
    state = reduce(state, {
      type: "FLAG_RECEIVED",
      flag: {
        id: "conflict",
        fillId: "fill-1",
        fieldIds: ["gradYear"],
        message: "Conflicting dates",
        severity: "error",
      },
    });
    state = reduce(state, { type: "REVIEW_START" });

    const cleared = reduce(state, { type: "CLEAR_AI" });

    expect(cleared.fields.fullName).toMatchObject({
      value: "Priya R.",
      provenance: { kind: "user" },
    });
    expect(cleared.fields.employer).toMatchObject({
      value: "Acme Corp",
      provenance: { kind: "answered" },
    });
    expect(cleared.fields.email).toMatchObject({
      value: "priya@example.com",
      provenance: { kind: "prefill" },
    });
    expect(cleared.fields.gradYear).toMatchObject({
      value: null,
      provenance: null,
      previous: null,
      reviewStatus: "none",
    });
    expect(cleared.fields.yearsExperience?.suggestion).toBeNull();
    expect(cleared.flags).toEqual([]);
    expect(cleared.review.active).toBe(false);
  });

  it("submit blockers cover every reason and prevent submit", () => {
    let state = started({
      email: "invalid",
      currentlyEmployed: true,
    });
    state = reduce(state, {
      type: "PROPOSAL_RECEIVED",
      proposal: proposal("fullName", "extracted", "Priya Raman"),
    });
    state = reduce(state, {
      type: "QUESTION_RECEIVED",
      question: question("employer"),
    });
    state = reduce(state, {
      type: "FLAG_RECEIVED",
      flag: {
        id: "blocking-flag",
        fillId: "fill-1",
        fieldIds: ["gradYear"],
        message: "Check graduation year",
        severity: "error",
      },
    });

    expect(
      new Set(submitBlockers(state).map((blocker) => blocker.reason)),
    ).toEqual(
      new Set(["unreviewed", "unanswered", "invalid", "required", "flag"]),
    );
    expect(reduce(state, { type: "SUBMIT_REQUESTED" })).toBe(state);
  });

  it("acknowledges flags and permits an unblocked submit lifecycle", () => {
    let state = started({
      fullName: "Priya Raman",
      email: "priya@example.com",
      currentlyEmployed: false,
      workAuthorization: "citizen",
    });
    state = reduce(state, {
      type: "FLAG_RECEIVED",
      flag: {
        id: "blocking-flag",
        fillId: "fill-1",
        fieldIds: ["fullName"],
        message: "Verify name",
        severity: "error",
      },
    });
    state = reduce(state, {
      type: "ACKNOWLEDGE_FLAG",
      flagId: "blocking-flag",
    });
    expect(submitBlockers(state)).toEqual([]);

    state = reduce(state, { type: "SUBMIT_REQUESTED" });
    expect(state.submit).toEqual({ status: "submitting" });
    state = reduce(state, { type: "SUBMIT_FAILED", error: "try again" });
    expect(state.submit).toEqual({ status: "failed", error: "try again" });
    state = reduce(state, { type: "SUBMIT_REQUESTED" });
    state = reduce(state, { type: "SUBMIT_SUCCEEDED" });
    expect(state.submit).toEqual({ status: "submitted" });
  });

  it("hidden fields neither block submit nor appear in the summary", () => {
    let state = started({
      fullName: "Priya Raman",
      email: "priya@example.com",
      currentlyEmployed: false,
      workAuthorization: "citizen",
    });
    state = reduce(state, {
      type: "PROPOSAL_RECEIVED",
      proposal: proposal("employer", "extracted", "Acme Corp"),
    });
    state = reduce(state, {
      type: "QUESTION_RECEIVED",
      question: question("title"),
    });

    expect(hiddenReason(state, "employer")).toEqual({
      gateFieldId: "currentlyEmployed",
      gateLabel: "Currently employed",
      gateValue: false,
    });
    expect(
      submitBlockers(state).some(
        (blocker) =>
          blocker.fieldId === "employer" || blocker.fieldId === "title",
      ),
    ).toBe(false);
    expect(submitSummary(state)).toMatchObject({
      prefill: 4,
      extracted: 0,
      total: 4,
    });

    for (const field of Object.values(state.fields)) {
      if (field.value !== null) {
        expect(field.provenance).not.toBeNull();
      }
    }
  });
});

describe("sources and review", () => {
  it("removes all references to a deleted source while keeping values", () => {
    let state = reduce(started(), { type: "SOURCE_ADDED", source });
    state = reduce(state, {
      type: "PROPOSAL_RECEIVED",
      proposal: proposal("fullName", "extracted", "Priya Raman"),
    });
    state = reduce(state, {
      type: "OVERRIDE",
      fieldId: "fullName",
      value: "Priya R.",
    });
    state = reduce(state, {
      type: "PROPOSAL_RECEIVED",
      proposal: {
        ...proposal("yearsExperience", "inferred", 9),
        span: span(24, "nine"),
      },
    });
    state = reduce(state, {
      type: "QUESTION_RECEIVED",
      question: question("employer"),
    });

    expect(
      highlightsForSource(state, source.id).map((item) => item.kind),
    ).toEqual(["option", "inferred"]);
    const removed = reduce(state, {
      type: "SOURCE_REMOVED",
      sourceId: source.id,
    });

    expect(removed.fields.fullName?.value).toBe("Priya R.");
    expect(removed.fields.fullName?.previous?.provenance).not.toHaveProperty(
      "span",
    );
    expect(removed.fields.yearsExperience?.suggestion?.span).toBeNull();
    expect(removed.fields.employer?.question?.options[0]).not.toHaveProperty(
      "span",
    );
    expect(highlightsForSource(removed, source.id)).toEqual([]);
  });

  it("reviews in definition order and skips an entry hidden mid-review", () => {
    let state = started();
    for (const nextProposal of [
      proposal("fullName", "extracted", "Priya Raman"),
      proposal("currentlyEmployed", "extracted", true),
      proposal("employer", "extracted", "Acme Corp"),
    ]) {
      state = reduce(state, {
        type: "PROPOSAL_RECEIVED",
        proposal: nextProposal,
      });
    }
    state = reduce(state, { type: "REVIEW_START" });
    expect(state.review).toEqual({
      active: true,
      order: ["fullName", "currentlyEmployed", "employer"],
      cursor: 0,
    });
    state = reduce(state, { type: "REVIEW_SKIP" });
    expect(reviewCursorFieldId(state)).toBe("currentlyEmployed");
    state = reduce(state, { type: "REVIEW_PREV" });
    expect(reviewCursorFieldId(state)).toBe("fullName");
    state = reduce(state, {
      type: "REVIEW_GOTO",
      fieldId: "currentlyEmployed",
    });
    state = reduce(state, {
      type: "OVERRIDE",
      fieldId: "currentlyEmployed",
      value: false,
    });
    state = reduce(state, { type: "REVIEW_NEXT" });
    expect(state.review).toEqual({
      active: false,
      order: ["fullName", "currentlyEmployed", "employer"],
      cursor: 3,
    });
    expect(reviewCursorFieldId(state)).toBeNull();
  });

  it("extends an active review pass with fields revealed after the cursor", () => {
    let state = started();
    for (const event of [
      {
        type: "PROPOSAL_RECEIVED",
        proposal: proposal("currentlyEmployed", "inferred", true),
      },
      {
        type: "PROPOSAL_RECEIVED",
        proposal: proposal("employer", "extracted", "Acme Corp"),
      },
      {
        type: "QUESTION_RECEIVED",
        question: question("title"),
      },
      {
        type: "PROPOSAL_RECEIVED",
        proposal: proposal("gradYear", "extracted", 2017),
      },
    ] satisfies FormEvent[]) {
      state = reduce(state, event);
    }

    state = reduce(state, { type: "REVIEW_START" });
    expect(state.review.order).toEqual(["currentlyEmployed", "gradYear"]);

    state = reduce(state, { type: "ACCEPT", fieldId: "currentlyEmployed" });
    state = reduce(state, { type: "REVIEW_NEXT" });
    expect(state.review.order).toEqual([
      "currentlyEmployed",
      "employer",
      "title",
      "gradYear",
    ]);
    expect(reviewCursorFieldId(state)).toBe("employer");

    state = reduce(state, { type: "REVIEW_NEXT" });
    expect(reviewCursorFieldId(state)).toBe("title");
    state = reduce(state, { type: "REVIEW_NEXT" });
    expect(reviewCursorFieldId(state)).toBe("gradYear");
    state = reduce(state, { type: "REVIEW_NEXT" });
    expect(state.review.active).toBe(false);
  });

  it("leaves fields revealed before the cursor behind the active pass", () => {
    let state = started({ currentlyEmployed: false });
    for (const event of [
      {
        type: "PROPOSAL_RECEIVED",
        proposal: proposal("employer", "extracted", "Acme Corp"),
      },
      {
        type: "PROPOSAL_RECEIVED",
        proposal: proposal("gradYear", "extracted", 2017),
      },
      {
        type: "PROPOSAL_RECEIVED",
        proposal: proposal("yearsExperience", "extracted", 9),
      },
    ] satisfies FormEvent[]) {
      state = reduce(state, event);
    }

    state = reduce(state, { type: "REVIEW_START" });
    expect(reviewCursorFieldId(state)).toBe("gradYear");
    state = reduce(state, {
      type: "OVERRIDE",
      fieldId: "currentlyEmployed",
      value: true,
    });
    state = reduce(state, { type: "REVIEW_NEXT" });

    expect(state.review.order).toEqual([
      "employer",
      "gradYear",
      "yearsExperience",
    ]);
    expect(reviewCursorFieldId(state)).toBe("yearsExperience");
    state = reduce(state, { type: "REVIEW_PREV" });
    state = reduce(state, { type: "REVIEW_PREV" });
    expect(reviewCursorFieldId(state)).toBe("employer");
  });
});

describe("scripted session", () => {
  it("accepts, overrides, reverts, and clears AI state", () => {
    const events: FormEvent[] = [
      {
        type: "PROPOSAL_RECEIVED",
        proposal: proposal("fullName", "extracted", "Priya Raman", "name"),
      },
      {
        type: "PROPOSAL_RECEIVED",
        proposal: proposal("yearsExperience", "inferred", 9, "years"),
      },
      { type: "ACCEPT", fieldId: "fullName" },
      { type: "OVERRIDE", fieldId: "fullName", value: "Priya R." },
      { type: "REVERT", fieldId: "fullName" },
      { type: "CLEAR_AI" },
    ];
    const final = events.reduce(reduce, started());

    expect({
      fullName: final.fields.fullName,
      yearsExperience: final.fields.yearsExperience,
      counts: final.fills["fill-1"]?.counts,
      flags: final.flags,
      review: final.review,
    }).toMatchInlineSnapshot(`
      {
        "counts": {
          "flags": 0,
          "proposals": 2,
          "questions": 0,
        },
        "flags": [],
        "fullName": {
          "issues": [
            {
              "code": "required",
              "message": "Full name is required",
              "severity": "error",
            },
          ],
          "previous": null,
          "provenance": null,
          "question": null,
          "reviewStatus": "none",
          "suggestion": null,
          "value": null,
        },
        "review": {
          "active": false,
          "cursor": 0,
          "order": [],
        },
        "yearsExperience": {
          "issues": [],
          "previous": null,
          "provenance": null,
          "question": null,
          "reviewStatus": "none",
          "suggestion": null,
          "value": null,
        },
      }
    `);
  });
});
