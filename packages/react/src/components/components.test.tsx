import type { FillTransport, Span } from "@ai-native-forms/core";
import { jobApplicationForm } from "@ai-native-forms/examples/forms";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { AIFormProvider } from "../context";
import { type AIFormApi, useAIForm } from "../useAIForm";
import { Ghost } from "./Ghost";
import { ProvenanceChip } from "./ProvenanceChip";
import { SourcePane } from "./SourcePane";

const idleTransport: FillTransport = async function* () {};

function Harness({ children }: { children: (api: AIFormApi) => ReactNode }) {
  const api = useAIForm({
    form: jobApplicationForm,
    transport: idleTransport,
    autoFillOnSource: false,
    initialValues: { linkedin: "linkedin.com/in/priya" },
  });
  return <AIFormProvider api={api}>{children(api)}</AIFormProvider>;
}

function span(sourceId: string, start: number, end: number): Span {
  return {
    sourceId,
    start,
    end,
    quote: "quote",
    match: "exact",
  };
}

describe("SourcePane", () => {
  it("splits overlapping highlights and activates the focused span", () => {
    let api: AIFormApi | undefined;
    const { container } = render(
      <Harness>
        {(value) => {
          api = value;
          return <SourcePane />;
        }}
      </Harness>,
    );
    if (!api) throw new Error("Harness did not expose the API");
    let sourceId = "";

    act(() => {
      sourceId = api?.sources.addText("abcdefghij", "resume.txt").id ?? "";
      api?.dispatch({
        type: "FILL_STARTED",
        fillId: "fill-overlap",
        sourceIds: [sourceId],
      });
      api?.dispatch({
        type: "PROPOSAL_RECEIVED",
        proposal: {
          id: "p-full-name",
          fillId: "fill-overlap",
          fieldId: "fullName",
          kind: "extracted",
          value: "bcdef",
          span: span(sourceId, 1, 6),
        },
      });
      api?.dispatch({
        type: "PROPOSAL_RECEIVED",
        proposal: {
          id: "p-email",
          fillId: "fill-overlap",
          fieldId: "email",
          kind: "inferred",
          value: "efgh@example.com",
          span: span(sourceId, 4, 8),
        },
      });
    });

    const sourceText = container.querySelector("[data-source-text]");
    expect(sourceText?.textContent).toBe("abcdefghij");
    expect(
      [...container.querySelectorAll("mark")].map((mark) => ({
        text: mark.textContent,
        fieldId: mark.dataset.fieldId,
        fieldIds: mark.dataset.fieldIds,
        kind: mark.dataset.kind,
      })),
    ).toEqual([
      {
        text: "bcd",
        fieldId: "fullName",
        fieldIds: "fullName",
        kind: "extracted",
      },
      {
        text: "ef",
        fieldId: "fullName",
        fieldIds: "fullName email",
        kind: "extracted",
      },
      {
        text: "gh",
        fieldId: "email",
        fieldIds: "email",
        kind: "inferred",
      },
    ]);

    act(() => api?.sources.focusSpan(span(sourceId, 4, 8)));

    const marks = [...container.querySelectorAll("mark")];
    expect(
      marks.find((mark) => mark.textContent === "bcd"),
    ).not.toHaveAttribute("data-active");
    expect(marks.find((mark) => mark.textContent === "ef")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(marks.find((mark) => mark.textContent === "gh")).toHaveAttribute(
      "data-active",
      "true",
    );
  });
});

describe("ProvenanceChip and Ghost", () => {
  it("labels every provenance kind", () => {
    let api: AIFormApi | undefined;
    render(
      <Harness>
        {(value) => {
          api = value;
          return (
            <div>
              {[
                "fullName",
                "email",
                "phone",
                "location",
                "linkedin",
                "yearsExperience",
              ].map((fieldId) => (
                <ProvenanceChip fieldId={fieldId} key={fieldId} />
              ))}
            </div>
          );
        }}
      </Harness>,
    );
    if (!api) throw new Error("Harness did not expose the API");
    const source = api.sources.addText("resume source", "resume.txt");

    act(() => {
      api?.dispatch({
        type: "FILL_STARTED",
        fillId: "fill-provenance",
        sourceIds: [source.id],
      });
      api?.dispatch({
        type: "PROPOSAL_RECEIVED",
        proposal: {
          id: "p-extracted",
          fillId: "fill-provenance",
          fieldId: "fullName",
          kind: "extracted",
          value: "Priya Raman",
          span: span(source.id, 0, 6),
        },
      });
      api?.dispatch({
        type: "QUESTION_RECEIVED",
        question: {
          id: "q-email",
          fillId: "fill-provenance",
          fieldId: "email",
          text: "Use this email?",
          allowFreeText: true,
          options: [
            {
              label: "Yes",
              value: "priya@example.com",
              span: span(source.id, 1, 7),
            },
          ],
        },
      });
      api?.field("email").answer("priya@example.com", 0);
      api
        ?.field("phone")
        .useSelection("+1 555 123 4567", span(source.id, 2, 8));
      api?.field("location").setValue("Bengaluru");
      api?.dispatch({
        type: "PROPOSAL_RECEIVED",
        proposal: {
          id: "p-inferred",
          fillId: "fill-provenance",
          fieldId: "yearsExperience",
          kind: "inferred",
          value: 8,
          span: null,
        },
      });
      api?.field("yearsExperience").accept();
    });

    expect(
      screen.getAllByRole("button", { name: "from resume.txt" }),
    ).toHaveLength(3);
    expect(screen.getByRole("button", { name: "you typed" })).toHaveAttribute(
      "data-kind",
      "user",
    );
    expect(screen.getByRole("button", { name: "prefilled" })).toHaveAttribute(
      "data-kind",
      "prefill",
    );
    expect(screen.getByRole("button", { name: "inferred" })).toHaveAttribute(
      "data-kind",
      "inferred",
    );
  });

  it("accepts and dismisses inferred suggestions", () => {
    let api: AIFormApi | undefined;
    render(
      <Harness>
        {(value) => {
          api = value;
          return (
            <div>
              <Ghost fieldId="yearsExperience" />
              <Ghost fieldId="coverNote" />
            </div>
          );
        }}
      </Harness>,
    );
    if (!api) throw new Error("Harness did not expose the API");

    act(() => {
      api?.dispatch({
        type: "FILL_STARTED",
        fillId: "fill-ghost",
        sourceIds: [],
      });
      for (const [fieldId, value] of [
        ["yearsExperience", 8],
        ["coverNote", "A generated note"],
      ] as const) {
        api?.dispatch({
          type: "PROPOSAL_RECEIVED",
          proposal: {
            id: `p-${fieldId}`,
            fillId: "fill-ghost",
            fieldId,
            kind: "inferred",
            value,
            span: null,
          },
        });
      }
    });

    const firstGhost = screen
      .getByText("8")
      .closest<HTMLElement>("[data-ghost]");
    const secondGhost = screen
      .getByText("A generated note")
      .closest<HTMLElement>("[data-ghost]");
    if (!firstGhost || !secondGhost) throw new Error("Ghosts did not render");
    fireEvent.click(within(firstGhost).getByRole("button", { name: "Accept" }));
    fireEvent.click(
      within(secondGhost).getByRole("button", { name: "Dismiss" }),
    );

    expect(api.field("yearsExperience").value).toBe(8);
    expect(api.field("yearsExperience").state.suggestion).toBeNull();
    expect(api.field("coverNote").value).toBeNull();
    expect(api.field("coverNote").state.suggestion).toBeNull();
  });
});
