import {
  createSource,
  type FillTransport,
  type Span,
} from "@ai-native-forms/core";
import { jobApplicationForm } from "@ai-native-forms/examples/forms";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { AIFormProvider } from "../context";
import { type AIFormApi, useAIForm } from "../useAIForm";
import { AskBack } from "./AskBack";
import { DropZone } from "./DropZone";
import { Field } from "./Field";
import { Ghost } from "./Ghost";
import { HumanOnlyNote } from "./HumanOnlyNote";
import { ProvenanceChip } from "./ProvenanceChip";
import { SourcePane } from "./SourcePane";

const idleTransport: FillTransport = async function* () {};

afterEach(cleanup);

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

  it("renders PDF page boundaries and removes the source", () => {
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
    act(() => {
      api?.dispatch({
        type: "SOURCE_ADDED",
        source: createSource({
          id: "pdf-source",
          now: 0,
          name: "resume.pdf",
          kind: "pdf",
          text: "ignored",
          pageTexts: ["alpha", "beta"],
        }),
      });
    });

    const markers = [...container.querySelectorAll<HTMLElement>("[data-page]")];
    expect(markers.map((marker) => marker.textContent)).toEqual([
      "Page 1",
      "Page 2",
    ]);
    expect(markers.map((marker) => marker.dataset.offset)).toEqual(["0", "7"]);
    const sourceText = container.querySelector("[data-source-text]");
    expect(
      [...(sourceText?.childNodes ?? [])].map((node) =>
        node instanceof HTMLElement
          ? `page-${node.dataset.page}`
          : node.textContent,
      ),
    ).toEqual(["page-1", "alpha\n\n", "page-2", "beta"]);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(container.querySelector('[data-source-id="pdf-source"]')).toBeNull();
    expect(api.sources.list).toEqual([]);
  });
});

describe("DropZone", () => {
  it("accepts PDF files and shows extraction progress", async () => {
    const added: File[] = [];
    render(
      <DropZone
        onFile={(file) => added.push(file)}
        onText={() => undefined}
        pending={["resume.pdf"]}
      />,
    );
    const input = screen.getByLabelText("Add source files");
    const file = new File([new Uint8Array([1])], "resume.pdf", {
      type: "application/pdf",
    });

    expect(input).toHaveAttribute("accept", expect.stringContaining(".pdf"));
    expect(screen.getByText("Extracting resume.pdf…")).toBeVisible();
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(added).toEqual([file]));
  });
});

describe("AskBack", () => {
  it("renders options, focuses their spans, and answers with the option index", () => {
    let api: AIFormApi | undefined;
    render(
      <Harness>
        {(value) => {
          api = value;
          return (
            <>
              <AskBack fieldId="employer" />
              <ProvenanceChip fieldId="employer" />
            </>
          );
        }}
      </Harness>,
    );
    if (!api) throw new Error("Harness did not expose the API");
    const source = api.sources.addText("Acme Corp Acme Labs", "resume.txt");
    const firstSpan = span(source.id, 0, 9);
    const secondSpan = span(source.id, 10, 19);

    act(() => {
      api?.dispatch({
        type: "FILL_STARTED",
        fillId: "fill-question",
        sourceIds: [source.id],
      });
      api?.dispatch({
        type: "QUESTION_RECEIVED",
        question: {
          id: "q-employer",
          fillId: "fill-question",
          fieldId: "employer",
          text: "Which is the employer?",
          allowFreeText: true,
          options: [
            { label: "Acme Corp", value: "Acme Corp", span: firstSpan },
            { label: "Acme Labs", value: "Acme Labs", span: secondSpan },
          ],
        },
      });
    });

    const group = screen.getByRole("group", { name: "Which is the employer?" });
    const options = within(group).getAllByRole("button", {
      name: /Acme Corp|Acme Labs/,
    });
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute("data-option");

    fireEvent.mouseEnter(options[1] as HTMLElement);
    expect(options[1]).toHaveAttribute("data-highlighted", "true");
    expect(api.sources.activeSpan).toEqual(secondSpan);

    fireEvent.click(options[0] as HTMLElement);
    expect(api.field("employer").state).toMatchObject({
      value: "Acme Corp",
      provenance: { kind: "answered", span: firstSpan },
      question: null,
    });
    expect(
      screen.queryByText("Which is the employer?"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "from resume.txt" }));
    expect(api.sources.activeSpan).toEqual(firstSpan);
  });

  it("normalizes free text before answering and explains the coercion", () => {
    let api: AIFormApi | undefined;
    render(
      <Harness>
        {(value) => {
          api = value;
          return <AskBack fieldId="startDate" />;
        }}
      </Harness>,
    );
    if (!api) throw new Error("Harness did not expose the API");

    act(() => {
      api?.dispatch({
        type: "FILL_STARTED",
        fillId: "fill-date",
        sourceIds: [],
      });
      api?.dispatch({
        type: "QUESTION_RECEIVED",
        question: {
          id: "q-date",
          fillId: "fill-date",
          fieldId: "startDate",
          text: "When did you start?",
          allowFreeText: true,
          options: [],
        },
      });
    });

    fireEvent.change(
      screen.getByRole("textbox", { name: "Answer Start date" }),
      {
        target: { value: "Mar 2021" },
      },
    );
    expect(screen.getByText("Read 'Mar 2021' as 2021-03-01")).toHaveAttribute(
      "data-normalization",
    );
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));

    expect(api.field("startDate").state).toMatchObject({
      value: "2021-03-01",
      provenance: { kind: "answered" },
      question: null,
    });
  });

  it("shows an inline error and keeps the question open for invalid free text", () => {
    let api: AIFormApi | undefined;
    render(
      <Harness>
        {(value) => {
          api = value;
          return <AskBack fieldId="startDate" />;
        }}
      </Harness>,
    );
    if (!api) throw new Error("Harness did not expose the API");

    act(() => {
      api?.dispatch({
        type: "FILL_STARTED",
        fillId: "fill-invalid-date",
        sourceIds: [],
      });
      api?.dispatch({
        type: "QUESTION_RECEIVED",
        question: {
          id: "q-invalid-date",
          fillId: "fill-invalid-date",
          fieldId: "startDate",
          text: "When did you start?",
          allowFreeText: true,
          options: [],
        },
      });
    });

    fireEvent.change(
      screen.getByRole("textbox", { name: "Answer Start date" }),
      {
        target: { value: "not a date" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid start date.",
    );
    expect(api.field("startDate").value).toBeNull();
    expect(api.field("startDate").state.question?.id).toBe("q-invalid-date");
  });
});

describe("ProvenanceChip and Ghost", () => {
  it("labels every provenance kind", () => {
    let api: AIFormApi | undefined;
    const { container } = render(
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
                <Field id={fieldId} key={fieldId}>
                  {() => <ProvenanceChip fieldId={fieldId} />}
                </Field>
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
      within(container).getAllByRole("button", { name: "from resume.txt" }),
    ).toHaveLength(3);
    expect(
      within(container).getByRole("button", { name: "you typed" }),
    ).toHaveAttribute("data-kind", "user");
    expect(
      within(container).getByRole("button", { name: "prefilled" }),
    ).toHaveAttribute("data-kind", "prefill");
    expect(
      within(container).getByRole("button", { name: "inferred" }),
    ).toHaveAttribute("data-kind", "inferred");
    expect(container.querySelector('[data-field="fullName"]')).toHaveAttribute(
      "data-provenance",
      "extracted",
    );
    expect(container.querySelector('[data-field="email"]')).toHaveAttribute(
      "data-provenance",
      "answered",
    );
    expect(container.querySelector('[data-field="location"]')).toHaveAttribute(
      "data-provenance",
      "user",
    );
    expect(
      container.querySelector('button[data-kind="answered"]'),
    ).toBeInTheDocument();
  });

  it("renders only the plain note for AI state injected into a human field", () => {
    function HumanHarness() {
      const api = useAIForm({
        form: jobApplicationForm,
        transport: idleTransport,
        autoFillOnSource: false,
      });
      const original = api.field("workAuthorization");
      const injected = {
        ...original,
        value: "citizen",
        state: {
          ...original.state,
          value: "citizen",
          provenance: { kind: "inferred" as const },
          suggestion: {
            id: "injected-proposal",
            fillId: "injected-fill",
            fieldId: "workAuthorization",
            kind: "inferred" as const,
            value: "citizen",
            span: null,
          },
          question: {
            id: "injected-question",
            fillId: "injected-fill",
            fieldId: "workAuthorization",
            text: "Injected question",
            options: [{ label: "Citizen", value: "citizen" }],
            allowFreeText: true,
          },
        },
        chip: {
          label: "inferred",
          kind: "inferred" as const,
          focus() {},
        },
      };
      const injectedApi: AIFormApi = {
        ...api,
        fields: { ...api.fields, workAuthorization: injected },
        field(id) {
          return id === "workAuthorization" ? injected : api.field(id);
        },
      };

      return (
        <AIFormProvider api={injectedApi}>
          <Field id="workAuthorization">
            {() => (
              <>
                <Ghost fieldId="workAuthorization" />
                <AskBack fieldId="workAuthorization" />
                <ProvenanceChip fieldId="workAuthorization" />
                <HumanOnlyNote fieldId="workAuthorization" />
              </>
            )}
          </Field>
        </AIFormProvider>
      );
    }

    const { container } = render(<HumanHarness />);
    expect(
      screen.getByText("You need to answer this one yourself"),
    ).toBeVisible();
    expect(
      container.querySelector('[data-policy="human"]'),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-ghost]")).not.toBeInTheDocument();
    expect(container.querySelector("[data-askback]")).not.toBeInTheDocument();
    expect(
      container.querySelector('button[data-kind="inferred"]'),
    ).not.toBeInTheDocument();
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
