import { readFileSync } from "node:fs";
import type { FieldValue, FillTransport } from "@ai-native-forms/core";
import { jobApplicationForm } from "@ai-native-forms/examples/forms";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { type AIFormApi, AIFormProvider, useAIForm } from "./index";
import { KitForm } from "./kit/Kit";

const idleTransport: FillTransport = async function* () {};

afterEach(cleanup);

function Harness() {
  const api = useAIForm({
    form: jobApplicationForm,
    transport: idleTransport,
    autoFillOnSource: false,
    initialValues: { currentlyEmployed: true },
  });
  return (
    <AIFormProvider api={api}>
      <KitForm keyboardReview={false} />
    </AIFormProvider>
  );
}

function renderKitHarness() {
  let currentApi: AIFormApi | undefined;

  function KitHarness() {
    currentApi = useAIForm({
      form: jobApplicationForm,
      transport: idleTransport,
      autoFillOnSource: false,
    });
    return (
      <AIFormProvider api={currentApi}>
        <KitForm keyboardReview={false} />
      </AIFormProvider>
    );
  }

  const view = render(<KitHarness />);
  if (!currentApi) throw new Error("Harness did not expose the API");
  return {
    api(): AIFormApi {
      if (!currentApi) throw new Error("Harness did not expose the API");
      return currentApi;
    },
    ...view,
  };
}

function suggest(
  api: AIFormApi,
  proposals: Array<{
    fieldId: string;
    value: FieldValue;
    rationale?: string;
  }>,
) {
  act(() => {
    api.dispatch({
      type: "FILL_STARTED",
      fillId: "kit-ghost-fill",
      sourceIds: [],
    });
    for (const proposal of proposals) {
      api.dispatch({
        type: "PROPOSAL_RECEIVED",
        proposal: {
          id: `proposal-${proposal.fieldId}`,
          fillId: "kit-ghost-fill",
          fieldId: proposal.fieldId,
          kind: "inferred",
          value: proposal.value,
          span: null,
          ...(proposal.rationale ? { rationale: proposal.rationale } : {}),
        },
      });
    }
  });
}

describe("styled kit", () => {
  it("renders actionable text suggestions and accepts or dismisses them", () => {
    const { api, container } = renderKitHarness();
    suggest(api(), [
      {
        fieldId: "fullName",
        value: "Priya Raman",
        rationale: "the applicant heading",
      },
      { fieldId: "location", value: "Bengaluru" },
    ]);

    const nameSuggestion = screen.getByRole("group", {
      name: "Suggestion for Full name",
    });
    expect(
      within(nameSuggestion).getByText("Inferred from: the applicant heading"),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Full name" })).toHaveAttribute(
      "placeholder",
      "Priya Raman",
    );
    expect(container.querySelector('[data-field="fullName"]')).toHaveAttribute(
      "data-settled",
      "true",
    );
    act(() => api().review.start());
    expect(
      within(nameSuggestion).getByText(
        "Enter to accept · Backspace to dismiss",
      ),
    ).toBeVisible();
    fireEvent.click(
      within(nameSuggestion).getByRole("button", {
        name: "Accept suggestion for Full name",
      }),
    );

    expect(api().field("fullName").value).toBe("Priya Raman");
    expect(
      screen.queryByRole("group", { name: "Suggestion for Full name" }),
    ).not.toBeInTheDocument();

    const locationSuggestion = screen.getByRole("group", {
      name: "Suggestion for Location",
    });
    fireEvent.click(
      within(locationSuggestion).getByRole("button", {
        name: "Dismiss suggestion for Location",
      }),
    );

    expect(api().field("location").value).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Suggestion for Location" }),
    ).not.toBeInTheDocument();
  });

  it("marks suggested boolean segments and shows the badge only on ghosts", () => {
    const { api, container } = renderKitHarness();
    suggest(api(), [
      { fieldId: "currentlyEmployed", value: false },
      { fieldId: "skills", value: ["typescript", "react"] },
    ]);

    const booleanField = container.querySelector<HTMLElement>(
      '[data-field="currentlyEmployed"]',
    );
    const skillsField = container.querySelector<HTMLElement>(
      '[data-field="skills"]',
    );
    const emptyField = container.querySelector<HTMLElement>(
      '[data-field="fullName"]',
    );
    if (!booleanField || !skillsField || !emptyField) {
      throw new Error("Fields did not render");
    }

    expect(
      within(booleanField).getByRole("button", { name: "No" }),
    ).toHaveAttribute("data-suggested", "true");
    expect(
      within(skillsField).getByText("React").closest("label"),
    ).toHaveAttribute("data-suggested", "true");
    expect(
      booleanField.querySelector("[data-suggestion-badge]"),
    ).toHaveTextContent("Suggested");
    expect(
      emptyField.querySelector("[data-suggestion-badge]"),
    ).not.toBeInTheDocument();
  });

  it("renders an inferred boolean ghost as Yes", async () => {
    const booleanTransport: FillTransport = async function* () {
      yield { type: "start", fillId: "boolean-fill", targetFieldIds: [] };
      yield {
        type: "proposal",
        proposal: {
          id: "boolean-proposal",
          fillId: "boolean-fill",
          fieldId: "currentlyEmployed",
          kind: "inferred",
          value: true,
          span: null,
        },
      };
      yield {
        type: "done",
        fillId: "boolean-fill",
        counts: { proposals: 1, questions: 0, flags: 0 },
      };
    };
    let api: AIFormApi | undefined;

    function GhostHarness() {
      api = useAIForm({
        form: jobApplicationForm,
        transport: booleanTransport,
        autoFillOnSource: false,
      });
      return (
        <AIFormProvider api={api}>
          <KitForm keyboardReview={false} />
        </AIFormProvider>
      );
    }

    render(<GhostHarness />);
    await act(async () => api?.fill.run());

    expect(
      screen.getByText("Yes", { selector: "[data-ghost] span" }),
    ).toBeVisible();
    expect(screen.queryByText("true")).not.toBeInTheDocument();
  });

  it("renders every job application field type", () => {
    render(<Harness />);

    expect(screen.getByRole("textbox", { name: "Full name" })).toHaveAttribute(
      "type",
      "text",
    );
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute(
      "type",
      "email",
    );
    expect(screen.getByRole("textbox", { name: "Phone" })).toHaveAttribute(
      "type",
      "tel",
    );
    expect(screen.getByRole("textbox", { name: "Start date" })).toHaveAttribute(
      "type",
      "text",
    );
    expect(
      screen.getByRole("textbox", { name: "Graduation year" }),
    ).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByRole("textbox", { name: "Cover note" }).tagName).toBe(
      "TEXTAREA",
    );
    expect(
      screen.getByRole("group", { name: "Currently employed" }),
    ).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: "Work authorization" }),
    ).toBeVisible();
    expect(screen.getByRole("group", { name: "Skills" })).toBeVisible();
  });

  it("imports headless pieces only through the public index", () => {
    const source = readFileSync("src/kit/Kit.tsx", "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
      (match) => match[1],
    );

    expect(imports).toEqual(["react", ".."]);
  });

  it("defines every documented CSS variable", () => {
    const css = readFileSync("kit.css", "utf8");
    for (const variable of [
      "--anf-bg",
      "--anf-fg",
      "--anf-muted",
      "--anf-border",
      "--anf-accent",
      "--anf-pending-bg",
      "--anf-inferred",
      "--anf-inferred-bg",
      "--anf-extracted",
      "--anf-danger",
      "--anf-radius",
      "--anf-font",
    ]) {
      expect(css).toContain(variable);
    }
  });
});
