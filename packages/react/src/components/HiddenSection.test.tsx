import {
  defineForm,
  type FieldValue,
  type FillTransport,
} from "@ai-native-forms/core";
import { jobApplicationForm } from "@ai-native-forms/examples/forms";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { AIFormProvider } from "../context";
import { type AIFormApi, useAIForm } from "../useAIForm";
import { useReviewKeyboard } from "../useReviewKeyboard";
import { Field } from "./Field";
import { Ghost } from "./Ghost";
import { HiddenSection } from "./HiddenSection";

const idleTransport: FillTransport = async function* () {};

const selectGateForm = defineForm({
  id: "select-gate",
  title: "Select gate",
  version: 1,
  sections: [
    {
      id: "gate",
      title: "Gate",
      fields: [
        {
          id: "mode",
          type: "select",
          label: "Application mode",
          options: [
            { value: "active", label: "Actively applying" },
            { value: "paused", label: "Taking a break" },
          ],
        },
      ],
    },
    {
      id: "details",
      title: "Details",
      showWhen: { field: "mode", equals: "active" },
      fields: [{ id: "note", type: "text", label: "Note" }],
    },
  ],
});

afterEach(cleanup);

interface HarnessProps {
  children(api: AIFormApi): ReactNode;
  expose(api: AIFormApi): void;
  initialValues?: Record<string, FieldValue>;
  transport?: FillTransport;
}

function Harness({
  children,
  expose,
  initialValues,
  transport = idleTransport,
}: HarnessProps) {
  const api = useAIForm({
    form: jobApplicationForm,
    transport,
    initialValues,
    autoFillOnSource: false,
  });
  useReviewKeyboard(api);
  expose(api);
  return <AIFormProvider api={api}>{children(api)}</AIFormProvider>;
}

function CurrentRole({ api }: { api: AIFormApi }) {
  const employer = api.field("employer");
  return (
    <HiddenSection sectionId="currentRole">
      <h2>Current role</h2>
      <label htmlFor="employer">Employer</label>
      <input {...employer.inputProps} />
    </HiddenSection>
  );
}

describe("HiddenSection", () => {
  it("uses a select option label in the collapsed reason", () => {
    function SelectGateHarness() {
      const api = useAIForm({
        form: selectGateForm,
        transport: idleTransport,
        initialValues: { mode: "paused" },
        autoFillOnSource: false,
      });
      return (
        <AIFormProvider api={api}>
          <HiddenSection sectionId="details">Details</HiddenSection>
        </AIFormProvider>
      );
    }

    render(<SelectGateHarness />);
    expect(
      screen.getByText(
        "Hidden because you answered Taking a break to Application mode",
      ),
    ).toBeVisible();
  });

  it("states why it collapsed and reopens without changing or submitting hidden values", async () => {
    const user = userEvent.setup();
    let currentApi: AIFormApi | undefined;
    const api = (): AIFormApi => {
      if (!currentApi) throw new Error("Harness did not expose the API");
      return currentApi;
    };

    const { container } = render(
      <Harness
        expose={(value) => (currentApi = value)}
        initialValues={{ currentlyEmployed: false, employer: "Acme Corp" }}
      >
        {(value) => <CurrentRole api={value} />}
      </Harness>,
    );

    expect(
      screen.getByText("Hidden because you answered No to Currently employed"),
    ).toBeVisible();
    expect(container.querySelector("[data-section]")).toHaveAttribute(
      "data-hidden",
      "true",
    );
    expect(screen.queryByLabelText("Employer")).not.toBeInTheDocument();
    expect(
      api().sections.find((section) => section.def.id === "currentRole")
        ?.fields,
    ).toHaveLength(3);

    await user.click(screen.getByRole("button", { name: "Show anyway" }));

    expect(screen.getByLabelText("Employer")).toHaveValue("Acme Corp");
    expect(api().field("currentlyEmployed").value).toBe(false);
    expect(
      api().sections.find((section) => section.def.id === "currentRole")
        ?.reopened,
    ).toBe(true);

    await user.clear(screen.getByLabelText("Employer"));
    await user.type(screen.getByLabelText("Employer"), "Acme Labs");
    expect(api().field("employer").value).toBe("Acme Labs");
    expect(api().submit.summary.user).toBe(0);

    act(() => api().field("currentlyEmployed").setValue(true));
    expect(screen.getByLabelText("Employer")).toHaveValue("Acme Labs");
    expect(
      api().sections.find((section) => section.def.id === "currentRole")
        ?.reopened,
    ).toBe(false);

    act(() => api().field("currentlyEmployed").setValue(false));
    expect(screen.queryByLabelText("Employer")).not.toBeInTheDocument();
    expect(api().field("employer").value).toBe("Acme Labs");
  });

  it("keeps an inferred gate proposal ghosted until acceptance", async () => {
    const transport: FillTransport = async function* () {
      yield { type: "start", fillId: "fill-gate", targetFieldIds: [] };
      yield {
        type: "proposal",
        proposal: {
          id: "proposal-currently-employed",
          fillId: "fill-gate",
          fieldId: "currentlyEmployed",
          kind: "inferred",
          value: false,
          span: null,
        },
      };
      yield {
        type: "done",
        fillId: "fill-gate",
        counts: { proposals: 1, questions: 0, flags: 0 },
      };
    };
    let currentApi: AIFormApi | undefined;
    const api = (): AIFormApi => {
      if (!currentApi) throw new Error("Harness did not expose the API");
      return currentApi;
    };

    render(
      <Harness expose={(value) => (currentApi = value)} transport={transport}>
        {(value) => (
          <>
            <Ghost fieldId="currentlyEmployed" />
            <CurrentRole api={value} />
          </>
        )}
      </Harness>,
    );

    expect(screen.getByLabelText("Employer")).toBeVisible();
    await act(async () => api().fill.run());

    expect(api().field("currentlyEmployed").status).toBe("ghost");
    expect(api().field("currentlyEmployed").value).toBeNull();
    expect(screen.getByLabelText("Employer")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(
      screen.queryByRole("heading", { name: "Current role" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Hidden because you answered No to Currently employed"),
    ).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Show anyway" }));
    expect(
      api().sections.find((section) => section.def.id === "currentRole")
        ?.reopened,
    ).toBe(true);

    act(() => api().field("currentlyEmployed").setValue(true));
    expect(screen.getByLabelText("Employer")).toBeVisible();
    expect(
      api().sections.find((section) => section.def.id === "currentRole")
        ?.reopened,
    ).toBe(false);
  });

  it("skips a collapsed section during keyboard review and summary", async () => {
    const user = userEvent.setup();
    const transport: FillTransport = async function* () {
      yield { type: "start", fillId: "fill-hidden", targetFieldIds: [] };
      for (const [fieldId, value] of [
        ["employer", "Acme Corp"],
        ["gradYear", 2017],
      ] as const) {
        yield {
          type: "proposal",
          proposal: {
            id: `proposal-${fieldId}`,
            fillId: "fill-hidden",
            fieldId,
            kind: "extracted",
            value,
            span: null,
          },
        };
      }
      yield {
        type: "done",
        fillId: "fill-hidden",
        counts: { proposals: 2, questions: 0, flags: 0 },
      };
    };
    let currentApi: AIFormApi | undefined;
    const api = (): AIFormApi => {
      if (!currentApi) throw new Error("Harness did not expose the API");
      return currentApi;
    };

    render(
      <Harness
        expose={(value) => (currentApi = value)}
        initialValues={{ currentlyEmployed: false }}
        transport={transport}
      >
        {(value) => {
          const gradYear = value.field("gradYear");
          return (
            <>
              <CurrentRole api={value} />
              <Field id="gradYear">
                {() => (
                  <>
                    <label htmlFor="gradYear">Graduation year</label>
                    <input {...gradYear.inputProps} />
                  </>
                )}
              </Field>
              <button onClick={value.review.start} type="button">
                Start review
              </button>
            </>
          );
        }}
      </Harness>,
    );

    await act(async () => api().fill.run());
    expect(api().submit.summary.extracted).toBe(1);
    expect(api().submit.summary.total).toBe(2);

    await user.click(screen.getByRole("button", { name: "Start review" }));
    expect(api().review.order).toEqual(["gradYear"]);
    expect(api().review.cursorFieldId).toBe("gradYear");
    expect(screen.getByLabelText("Graduation year")).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(api().review.active).toBe(false);
    expect(api().field("employer").state.reviewStatus).toBe("pending");
  });
});
