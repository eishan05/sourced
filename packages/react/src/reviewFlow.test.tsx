import {
  defineForm,
  type FieldValue,
  type FillEvent,
  type FillTransport,
} from "@ai-native-forms/core";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AskBack } from "./components/AskBack";
import { Field } from "./components/Field";
import { ReviewBar } from "./components/ReviewBar";
import { SubmitSummary } from "./components/SubmitSummary";
import { AIFormProvider } from "./context";
import { type AIFormApi, useAIForm } from "./useAIForm";
import { useReviewKeyboard } from "./useReviewKeyboard";

afterEach(cleanup);

const reviewForm = defineForm({
  id: "review-form",
  title: "Review form",
  version: 1,
  sections: [
    {
      id: "details",
      title: "Details",
      fields: [
        { id: "name", type: "text", label: "Name" },
        { id: "company", type: "text", label: "Company" },
        { id: "role", type: "text", label: "Role" },
        { id: "years", type: "number", label: "Years" },
        { id: "authorization", type: "text", label: "Authorization" },
      ],
    },
  ],
});

function span(sourceId: string, start: number, quote: string) {
  return {
    sourceId,
    start,
    end: start + quote.length,
    quote,
    match: "exact" as const,
  };
}

function proposal(
  fillId: string,
  sourceId: string,
  fieldId: string,
  kind: "extracted" | "inferred",
  value: FieldValue,
  start: number,
): FillEvent {
  return {
    type: "proposal",
    proposal: {
      id: `proposal-${fieldId}`,
      fillId,
      fieldId,
      kind,
      value,
      span: kind === "extracted" ? span(sourceId, start, String(value)) : null,
    },
  };
}

const reviewTransport: FillTransport = async function* (request) {
  const fillId = "fill-review";
  const sourceId = request.sources[0]?.id ?? "missing";
  yield { type: "start", fillId, targetFieldIds: [] };
  yield proposal(fillId, sourceId, "name", "extracted", "Priya", 0);
  yield proposal(fillId, sourceId, "company", "extracted", "Globex", 10);
  yield proposal(fillId, sourceId, "role", "extracted", "Engineer", 20);
  yield proposal(fillId, sourceId, "years", "inferred", 8, 30);
  yield {
    type: "question",
    question: {
      id: "question-authorization",
      fillId,
      fieldId: "authorization",
      text: "Which authorization applies?",
      options: [
        {
          label: "Citizen",
          value: "citizen",
          span: span(sourceId, 40, "Citizen"),
        },
        {
          label: "Sponsorship",
          value: "sponsorship",
          span: span(sourceId, 50, "Sponsorship"),
        },
      ],
      allowFreeText: true,
    },
  };
  yield {
    type: "done",
    fillId,
    counts: { proposals: 4, questions: 1, flags: 0 },
  };
};

interface HarnessProps {
  expose(api: AIFormApi): void;
  confirmClear?: (message: string) => boolean;
  children?: ReactNode;
}

function Harness({ expose, confirmClear, children }: HarnessProps) {
  const api = useAIForm({
    form: reviewForm,
    transport: reviewTransport,
    autoFillOnSource: false,
  });
  useReviewKeyboard(api);
  expose(api);

  const fill = (): void => {
    if (api.sources.list.length === 0) {
      api.sources.addText(
        "Priya     Globex    Engineer            Citizen   Sponsorship",
        "resume.txt",
      );
    }
    void api.fill.run();
  };

  return (
    <AIFormProvider api={api}>
      <button onClick={fill} type="button">
        Fill
      </button>
      <ReviewBar />
      {Object.values(api.fields).map((item) => (
        <Field id={item.def.id} key={item.def.id}>
          {(field) => (
            <div>
              <label htmlFor={field.def.id}>{field.def.label}</label>
              <input {...field.inputProps} />
              <AskBack fieldId={field.def.id} />
            </div>
          )}
        </Field>
      ))}
      <SubmitSummary confirmClear={confirmClear} />
      {children}
    </AIFormProvider>
  );
}

function renderHarness(confirmClear?: (message: string) => boolean) {
  let currentApi: AIFormApi | undefined;
  render(
    <Harness
      confirmClear={confirmClear}
      expose={(api) => (currentApi = api)}
    />,
  );
  return {
    api(): AIFormApi {
      if (!currentApi) throw new Error("Harness did not expose the API");
      return currentApi;
    },
  };
}

async function finishFill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Fill" }));
  await waitFor(() =>
    expect(
      screen.getByText("3 fields filled, 1 suggested. Review them."),
    ).toBeVisible(),
  );
}

describe("review keyboard flow", () => {
  it("reviews pending, overridden, ghost, and question fields in order", async () => {
    const user = userEvent.setup();
    const harness = renderHarness();
    await finishFill(user);

    // The empty question is a fifth review entry, but is not described as filled.
    // The banner separates the three filled proposals from the visible ghost.
    expect(
      screen.getByText("3 fields filled, 1 suggested. Review them."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Start review" }));

    expect(harness.api().review.cursorFieldId).toBe("name");
    expect(harness.api().review.progress).toEqual({ index: 1, total: 5 });
    expect(screen.getByLabelText("Name")).toHaveFocus();
    expect(harness.api().sources.activeSpan?.quote).toBe("Priya");

    await user.keyboard("{Enter}");
    expect(harness.api().field("name").state.reviewStatus).toBe("accepted");
    expect(harness.api().review.cursorFieldId).toBe("company");

    await user.keyboard("{Escape}");
    expect(harness.api().field("company").state.reviewStatus).toBe("pending");
    expect(harness.api().review.cursorFieldId).toBe("role");

    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(harness.api().review.cursorFieldId).toBe("company");

    const company = screen.getByLabelText("Company");
    await user.clear(company);
    await user.type(company, "Acme");
    await user.keyboard("{Enter}");
    expect(harness.api().field("company").state).toMatchObject({
      value: "Acme",
      reviewStatus: "overridden",
      provenance: { kind: "user" },
    });
    expect(harness.api().review.cursorFieldId).toBe("role");

    await user.keyboard("{Enter}");
    expect(harness.api().review.cursorFieldId).toBe("years");
    await user.keyboard("{Enter}");
    expect(harness.api().field("years").state).toMatchObject({
      value: 8,
      reviewStatus: "accepted",
      provenance: { kind: "inferred" },
    });
    expect(harness.api().review.cursorFieldId).toBe("authorization");

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Sponsorship" })).toHaveAttribute(
      "data-highlighted",
      "true",
    );
    await user.keyboard("{Enter}");
    expect(harness.api().field("authorization").state).toMatchObject({
      value: "sponsorship",
      reviewStatus: "accepted",
      provenance: { kind: "answered" },
    });
    expect(harness.api().review.active).toBe(false);
    expect(screen.getByText("All reviewed")).toBeVisible();
  });

  it("dismisses an empty ghost in place and lets Tab leave review mode", async () => {
    const user = userEvent.setup();
    const harness = renderHarness();
    await finishFill(user);
    await user.click(screen.getByRole("button", { name: "Start review" }));

    act(() => harness.api().review.goTo("years"));
    expect(screen.getByLabelText("Years")).toHaveFocus();
    await user.keyboard("{Backspace}");
    expect(harness.api().field("years").state.suggestion).toBeNull();
    expect(harness.api().review.cursorFieldId).toBe("years");
    expect(harness.api().review.active).toBe(true);

    await user.keyboard("{Tab}");
    expect(harness.api().review.active).toBe(false);
    expect(screen.getByRole("button", { name: "Review again" })).toBeVisible();
  });

  it("does not install or react to the review listener while inactive", async () => {
    const addEventListener = vi.spyOn(document, "addEventListener");
    const user = userEvent.setup();
    const harness = renderHarness();

    expect(
      addEventListener.mock.calls.some(([event]) => event === "keydown"),
    ).toBe(false);
    await user.keyboard("{Enter}");
    expect(harness.api().review.active).toBe(false);
    expect(harness.api().field("name").value).toBeNull();
    addEventListener.mockRestore();
  });
});

describe("submit summary", () => {
  it("gates submit, focuses blockers, summarizes provenance, and clears AI values", async () => {
    const confirmClear = vi.fn(() => true);
    const user = userEvent.setup();
    const harness = renderHarness(confirmClear);
    await finishFill(user);

    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Start review" }));
    await user.click(
      screen.getByRole("button", { name: "Company: needs review" }),
    );
    expect(harness.api().review.cursorFieldId).toBe("company");
    expect(screen.getByLabelText("Company")).toHaveFocus();

    act(() => {
      const api = harness.api();
      api.field("name").accept();
      api.field("company").setValue("Acme");
      api.field("role").accept();
      api.field("years").accept();
      api.field("authorization").answer("sponsorship", 1);
      api.review.end();
    });

    expect(harness.api().submit.blockers).toEqual([]);
    expect(submit).toBeEnabled();
    expect(
      screen.getByText(
        "3 from resume.txt, 1 you typed, 1 inferred and marked, 1 answered.",
      ),
    ).toBeVisible();
    await user.click(submit);
    await waitFor(() => expect(harness.api().submit.status).toBe("submitted"));

    await user.click(
      screen.getByRole("button", {
        name: "Clear everything the AI filled",
      }),
    );
    expect(confirmClear).toHaveBeenCalledOnce();
    expect(harness.api().field("name").value).toBeNull();
    expect(harness.api().field("role").value).toBeNull();
    expect(harness.api().field("years").value).toBeNull();
    expect(harness.api().field("company").value).toBe("Acme");
    expect(harness.api().field("authorization").value).toBe("sponsorship");
  });
});
