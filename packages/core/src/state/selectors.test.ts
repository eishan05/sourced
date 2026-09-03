import { describe, expect, it } from "vitest";

import { createInitialState, reduce } from "./reducer";
import {
  fieldsUsingSource,
  hiddenReason,
  highlightsForSource,
  isVisible,
  submitSummary,
  unreviewedAiFieldIds,
  values,
  visibleFieldIds,
} from "./selectors";
import { testForm } from "./test-form";
import type { Span } from "./types";

function sourceSpan(start: number, quote: string): Span {
  return {
    sourceId: "resume",
    start,
    end: start + quote.length,
    quote,
    match: "exact",
  };
}

describe("state selectors", () => {
  it("returns values and gated field visibility", () => {
    const hidden = createInitialState(testForm, { currentlyEmployed: false });
    const visible = createInitialState(testForm, { currentlyEmployed: true });

    expect(values(hidden).currentlyEmployed).toBe(false);
    expect(isVisible(hidden, "employer")).toBe(false);
    expect(isVisible(visible, "employer")).toBe(true);
    expect(visibleFieldIds(hidden)).not.toContain("employer");
    expect(isVisible(hidden, "missing")).toBe(false);
  });

  it("reports the first failing leaf of nested gates", () => {
    const nested = createInitialState({
      id: "nested",
      title: "Nested",
      version: 1,
      sections: [
        {
          id: "details",
          title: "Details",
          showWhen: {
            all: [
              { field: "enabled", equals: true },
              {
                any: [
                  { field: "mode", equals: "full" },
                  { field: "admin", equals: true },
                ],
              },
            ],
          },
          fields: [{ id: "detail", type: "text", label: "Detail" }],
        },
        {
          id: "controls",
          title: "Controls",
          fields: [
            { id: "enabled", type: "boolean", label: "Enabled" },
            { id: "mode", type: "text", label: "Mode" },
            { id: "admin", type: "boolean", label: "Administrator" },
          ],
        },
      ],
    });

    expect(hiddenReason(nested, "details")).toEqual({
      gateFieldId: "enabled",
      gateLabel: "Enabled",
      gateValue: null,
    });
    const enabled = reduce(nested, {
      type: "OVERRIDE",
      fieldId: "enabled",
      value: true,
    });
    expect(hiddenReason(enabled, "detail")).toEqual({
      gateFieldId: "mode",
      gateLabel: "Mode",
      gateValue: null,
    });
  });

  it("summarizes visible provenance and source use", () => {
    let state = createInitialState(testForm, {
      email: "priya@example.com",
      currentlyEmployed: true,
    });
    state = reduce(state, {
      type: "SOURCE_ADDED",
      source: {
        id: "resume",
        name: "Resume",
        kind: "paste",
        text: "Priya Raman Acme Corp",
        addedAt: 1,
      },
    });
    state = reduce(state, {
      type: "FILL_STARTED",
      fillId: "fill-1",
      sourceIds: ["resume"],
    });
    state = reduce(state, {
      type: "PROPOSAL_RECEIVED",
      proposal: {
        id: "name",
        fillId: "fill-1",
        fieldId: "fullName",
        kind: "extracted",
        value: "Priya Raman",
        span: sourceSpan(0, "Priya Raman"),
      },
    });
    state = reduce(state, {
      type: "PROPOSAL_RECEIVED",
      proposal: {
        id: "years",
        fillId: "fill-1",
        fieldId: "yearsExperience",
        kind: "inferred",
        value: 9,
        span: sourceSpan(18, "Corp"),
      },
    });
    state = reduce(state, {
      type: "QUESTION_RECEIVED",
      question: {
        id: "employer-question",
        fillId: "fill-1",
        fieldId: "employer",
        text: "Employer?",
        options: [
          {
            label: "Acme",
            value: "Acme Corp",
            span: sourceSpan(12, "Acme Corp"),
          },
        ],
        allowFreeText: false,
      },
    });
    state = reduce(state, {
      type: "ANSWER",
      fieldId: "employer",
      value: "Acme Corp",
      optionIndex: 0,
    });

    expect(unreviewedAiFieldIds(state)).toEqual(["fullName"]);
    expect(submitSummary(state)).toEqual({
      extracted: 1,
      inferred: 0,
      answered: 1,
      user: 0,
      prefill: 2,
      total: 4,
      bySource: { Resume: 2 },
    });
    expect(
      highlightsForSource(state, "resume").map((highlight) => ({
        fieldId: highlight.fieldId,
        kind: highlight.kind,
        start: highlight.span.start,
      })),
    ).toEqual([
      { fieldId: "fullName", kind: "extracted", start: 0 },
      { fieldId: "employer", kind: "option", start: 12 },
      { fieldId: "yearsExperience", kind: "inferred", start: 18 },
    ]);
    expect(fieldsUsingSource(state, "resume")).toEqual([
      "fullName",
      "employer",
      "yearsExperience",
    ]);
  });
});
