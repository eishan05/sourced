import { readFileSync } from "node:fs";
import type { FillTransport } from "@ai-native-forms/core";
import { jobApplicationForm } from "@ai-native-forms/examples/forms";
import { act, cleanup, render, screen } from "@testing-library/react";
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

describe("styled kit", () => {
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
      "--anf-extracted",
      "--anf-danger",
      "--anf-radius",
      "--anf-font",
    ]) {
      expect(css).toContain(variable);
    }
  });
});
