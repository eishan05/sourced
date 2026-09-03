import {
  defineForm,
  type FillEvent,
  type FillTransport,
} from "@ai-native-forms/core";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { Field } from "./components/Field";
import { AIFormProvider } from "./context";
import { type AIFormApi, useAIForm } from "./useAIForm";
import { useReviewKeyboard } from "./useReviewKeyboard";

afterEach(cleanup);

const form = defineForm({
  id: "ghost-textarea",
  title: "Ghost textarea",
  version: 1,
  sections: [
    {
      id: "main",
      title: "Main",
      fields: [
        { id: "note", type: "textarea", label: "Note", policy: "infer" },
      ],
    },
  ],
});

const events: FillEvent[] = [
  { type: "start", fillId: "f1", targetFieldIds: ["note"] },
  {
    type: "proposal",
    proposal: {
      id: "p1",
      fillId: "f1",
      fieldId: "note",
      kind: "inferred",
      value: "Drafted note",
      span: null,
    },
  },
  {
    type: "done",
    fillId: "f1",
    counts: { proposals: 1, questions: 0, flags: 0 },
  },
];

const transport: FillTransport = async function* () {
  for (const event of events) yield event;
};

let latest: AIFormApi | null = null;

function Harness() {
  const api = useAIForm({ form, transport, autoFillOnSource: true });
  useReviewKeyboard(api);
  latest = api;
  return (
    <AIFormProvider api={api}>
      <Field id="note">{(field) => <textarea {...field.inputProps} />}</Field>
    </AIFormProvider>
  );
}

describe("review keyboard on a ghost textarea", () => {
  it("accepts the suggestion with Enter instead of inserting a newline", async () => {
    render(<Harness />);
    act(() => {
      latest?.sources.addText("Some source text", "notes.txt");
    });
    await waitFor(() => expect(latest?.fill.status).toBe("done"));
    expect(latest?.field("note").status).toBe("ghost");

    act(() => latest?.review.start());
    expect(latest?.review.active).toBe(true);

    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(latest?.field("note").status).toBe("ai-accepted"),
    );
    expect(latest?.field("note").value).toBe("Drafted note");
    expect(latest?.review.active).toBe(false);
  });
});
