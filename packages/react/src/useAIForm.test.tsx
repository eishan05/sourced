import type { FillEvent, FillTransport, Proposal } from "@ai-native-forms/core";
import { jobApplicationForm } from "@ai-native-forms/examples/forms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useAIForm } from "./useAIForm";

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal?.addEventListener("abort", finish, { once: true });
  });
}

function proposal(
  fillId: string,
  fieldId: string,
  value: Proposal["value"],
  sourceId: string,
  start: number,
  end: number,
): FillEvent {
  return {
    type: "proposal",
    proposal: {
      id: `proposal-${fieldId}`,
      fillId,
      fieldId,
      kind: "extracted",
      value,
      span: {
        sourceId,
        start,
        end,
        quote: "resume quote",
        match: "exact",
      },
    },
  };
}

describe("useAIForm fill lifecycle", () => {
  it("auto-fills a new source and applies delayed proposals incrementally", async () => {
    let generatorFinished = false;
    const transport: FillTransport = async function* (request, signal) {
      const sourceId = request.sources[0]?.id ?? "missing";
      yield { type: "start", fillId: "fill-1", targetFieldIds: [] };
      await delay(20, signal);
      if (signal?.aborted) return;
      yield proposal("fill-1", "fullName", "Priya Raman", sourceId, 0, 5);
      await delay(100, signal);
      if (signal?.aborted) return;
      yield proposal("fill-1", "email", "priya@example.com", sourceId, 6, 12);
      await delay(20, signal);
      yield {
        type: "done",
        fillId: "fill-1",
        counts: { proposals: 2, questions: 0, flags: 0 },
      };
      generatorFinished = true;
    };
    const { result } = renderHook(() =>
      useAIForm({ form: jobApplicationForm, transport }),
    );

    act(() => {
      result.current.sources.addText("Priya Raman resume", "resume.txt");
    });

    await waitFor(() => {
      expect(result.current.fill.status).toBe("streaming");
      expect(result.current.field("fullName").value).toBe("Priya Raman");
    });
    expect(result.current.field("email").value).toBeNull();
    expect(generatorFinished).toBe(false);

    await waitFor(() => {
      expect(result.current.field("email").value).toBe("priya@example.com");
    });
    await waitFor(() => expect(result.current.fill.status).toBe("done"));
    expect(generatorFinished).toBe(true);
  });

  it("cancels mid-stream without discarding proposals already received", async () => {
    const transport: FillTransport = async function* (request, signal) {
      const sourceId = request.sources[0]?.id ?? "missing";
      yield { type: "start", fillId: "fill-cancel", targetFieldIds: [] };
      yield proposal("fill-cancel", "fullName", "Priya Raman", sourceId, 0, 5);
      await delay(2_000, signal);
      if (signal?.aborted) return;
      yield proposal(
        "fill-cancel",
        "email",
        "late@example.com",
        sourceId,
        6,
        12,
      );
    };
    const { result } = renderHook(() =>
      useAIForm({
        form: jobApplicationForm,
        transport,
        autoFillOnSource: false,
      }),
    );
    act(() => {
      result.current.sources.addText("Priya Raman resume", "resume.txt");
    });

    let runPromise: Promise<void> | undefined;
    act(() => {
      runPromise = result.current.fill.run();
    });
    await waitFor(() =>
      expect(result.current.field("fullName").value).toBe("Priya Raman"),
    );
    act(() => result.current.fill.cancel());

    expect(result.current.fill.status).toBe("error");
    expect(result.current.fill.error).toBe("Cancelled");
    expect(result.current.field("fullName").value).toBe("Priya Raman");
    expect(result.current.field("email").value).toBeNull();
    await act(async () => runPromise);
  });

  it("surfaces an error emitted before start", async () => {
    const transport: FillTransport = async function* () {
      yield {
        type: "error",
        fillId: "",
        message: "Network unavailable",
        retryable: true,
      };
    };
    const { result } = renderHook(() =>
      useAIForm({
        form: jobApplicationForm,
        transport,
        autoFillOnSource: false,
      }),
    );

    await act(async () => result.current.fill.run());

    expect(result.current.fill.status).toBe("error");
    expect(result.current.fill.error).toBe("Network unavailable");
    expect(Object.keys(result.current.state.fills)).toEqual(["local-1"]);
  });

  it("records dropped events for diagnostics", async () => {
    const transport: FillTransport = async function* () {
      yield { type: "start", fillId: "fill-drop", targetFieldIds: [] };
      yield {
        type: "dropped",
        fillId: "fill-drop",
        fieldId: "fullName",
        reason: "quote_not_found",
        detail: "Could not locate quote",
      };
      yield {
        type: "done",
        fillId: "fill-drop",
        counts: { proposals: 0, questions: 0, flags: 0 },
      };
    };
    const { result } = renderHook(() =>
      useAIForm({
        form: jobApplicationForm,
        transport,
        autoFillOnSource: false,
      }),
    );

    await act(async () => result.current.fill.run());

    expect(result.current.fill.dropped).toEqual([
      {
        fieldId: "fullName",
        reason: "quote_not_found",
        detail: "Could not locate quote",
      },
    ]);
  });
});

describe("field input props", () => {
  const idleTransport: FillTransport = async function* () {};

  it("coerces number and checkbox change events", () => {
    const { result } = renderHook(() =>
      useAIForm({
        form: jobApplicationForm,
        transport: idleTransport,
        autoFillOnSource: false,
      }),
    );

    act(() => {
      result.current
        .field("gradYear")
        .inputProps.onChange({ target: { value: "2024" } });
      result.current
        .field("currentlyEmployed")
        .inputProps.onChange({ target: { value: "on", checked: true } });
    });

    expect(result.current.field("gradYear").value).toBe(2024);
    expect(result.current.field("currentlyEmployed").value).toBe(true);
  });
});
