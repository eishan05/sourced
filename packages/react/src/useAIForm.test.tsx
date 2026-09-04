import type {
  FillEvent,
  FillRequest,
  FillTransport,
  Proposal,
} from "@sourced/core";
import { jobApplicationForm } from "@sourced/examples/forms";
import { act, renderHook, waitFor } from "@testing-library/react";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

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
  it("marks a newly AI-filled field as settled for 600ms", () => {
    vi.useFakeTimers();
    const transport: FillTransport = async function* () {};
    const { result } = renderHook(() =>
      useAIForm({
        form: jobApplicationForm,
        transport,
        autoFillOnSource: false,
      }),
    );

    act(() => {
      result.current.dispatch({
        type: "FILL_STARTED",
        fillId: "fill-settle",
        sourceIds: [],
      });
      result.current.dispatch({
        type: "PROPOSAL_RECEIVED",
        proposal: {
          id: "proposal-settle",
          fillId: "fill-settle",
          fieldId: "fullName",
          kind: "extracted",
          value: "Priya Raman",
          span: null,
        },
      });
    });

    expect(result.current.field("fullName").justFilled).toBe(true);
    act(() => vi.advanceTimersByTime(599));
    expect(result.current.field("fullName").justFilled).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.field("fullName").justFilled).toBe(false);
    vi.useRealTimers();
  });

  it("runs one automatic check after a fill changes values", async () => {
    const modes: FillRequest["mode"][] = [];
    let checkValues: Record<string, unknown> | undefined;
    const transport: FillTransport = async function* (request) {
      modes.push(request.mode);
      if (request.mode === "check") {
        checkValues = request.currentValues;
        yield { type: "start", fillId: "check-1", targetFieldIds: [] };
        yield {
          type: "flag",
          flag: {
            id: "flag-dates",
            fillId: "check-1",
            fieldIds: ["startDate", "gradYear"],
            message: "The start date is before graduation.",
            severity: "warning",
          },
        };
        yield {
          type: "done",
          fillId: "check-1",
          counts: { proposals: 0, questions: 0, flags: 1 },
        };
        return;
      }

      const sourceId = request.sources[0]?.id ?? "missing";
      yield {
        type: "start",
        fillId: `fill-${modes.length}`,
        targetFieldIds: [],
      };
      yield proposal(
        `fill-${modes.length}`,
        "fullName",
        "Priya Raman",
        sourceId,
        0,
        5,
      );
      yield {
        type: "done",
        fillId: `fill-${modes.length}`,
        counts: { proposals: 1, questions: 0, flags: 0 },
      };
    };
    const { result } = renderHook(() =>
      useAIForm({
        form: jobApplicationForm,
        transport,
        autoFillOnSource: false,
      }),
    );
    act(() => {
      result.current.sources.addText("Priya Raman", "resume.txt");
    });

    await act(async () => result.current.fill.run());

    expect(modes).toEqual(["fill", "check"]);
    expect(checkValues).toMatchObject({ fullName: "Priya Raman" });
    expect(result.current.check.status).toBe("done");
    expect(result.current.state.flags).toHaveLength(1);

    await act(async () => result.current.fill.run());
    expect(modes).toEqual(["fill", "check", "fill"]);
  });

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
      generatorFinished = true;
      yield {
        type: "done",
        fillId: "fill-1",
        counts: { proposals: 2, questions: 0, flags: 0 },
      };
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
    expect(result.current.fill.retryable).toBe(true);
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

  it("blocks submission on a question and preserves its chosen option span", async () => {
    const transport: FillTransport = async function* (request) {
      const sourceId = request.sources[0]?.id ?? "missing";
      const optionSpan = {
        sourceId,
        start: 0,
        end: 5,
        quote: "Priya",
        match: "exact" as const,
      };
      yield { type: "start", fillId: "fill-question", targetFieldIds: [] };
      yield {
        type: "question",
        question: {
          id: "question-name",
          fillId: "fill-question",
          fieldId: "fullName",
          text: "Which name should be used?",
          options: [{ label: "Priya", value: "Priya Raman", span: optionSpan }],
          allowFreeText: true,
        },
      };
      yield {
        type: "done",
        fillId: "fill-question",
        counts: { proposals: 0, questions: 1, flags: 0 },
      };
    };
    const { result } = renderHook(() =>
      useAIForm({
        form: jobApplicationForm,
        transport,
        autoFillOnSource: false,
      }),
    );
    act(() => {
      result.current.sources.addText("Priya Raman", "resume.txt");
    });

    await act(async () => result.current.fill.run());

    expect(result.current.submit.blockers).toContainEqual({
      reason: "unanswered",
      fieldId: "fullName",
    });
    act(() => result.current.field("fullName").answer("Priya Raman", 0));

    expect(result.current.submit.blockers).not.toContainEqual({
      reason: "unanswered",
      fieldId: "fullName",
    });
    expect(result.current.field("fullName").state).toMatchObject({
      value: "Priya Raman",
      provenance: {
        kind: "answered",
        questionId: "question-name",
        span: { quote: "Priya" },
      },
      question: null,
    });
  });

  it("keeps accepted and typed values on re-fill while filling empty fields", async () => {
    let call = 0;
    let secondFillValues: Record<string, unknown> | undefined;
    const transport: FillTransport = async function* (request) {
      if (request.mode === "check") {
        yield { type: "start", fillId: "check-refill", targetFieldIds: [] };
        yield {
          type: "done",
          fillId: "check-refill",
          counts: { proposals: 0, questions: 0, flags: 0 },
        };
        return;
      }
      call += 1;
      const fillId = `fill-${call}`;
      const sourceId = request.sources[0]?.id ?? "missing";
      if (call === 2) secondFillValues = request.currentValues;
      yield { type: "start", fillId, targetFieldIds: [] };
      const proposals =
        call === 1
          ? [
              proposal(fillId, "fullName", "Priya Raman", sourceId, 0, 5),
              proposal(fillId, "email", "priya@example.com", sourceId, 0, 5),
            ]
          : [
              proposal(fillId, "fullName", "Priya R.", sourceId, 0, 5),
              proposal(fillId, "email", "new@example.com", sourceId, 0, 5),
              proposal(fillId, "phone", "+1 555 999 0000", sourceId, 0, 5),
              proposal(fillId, "location", "Bengaluru", sourceId, 0, 5),
            ];
      for (const item of proposals) yield item;
      yield {
        type: "done",
        fillId,
        counts: {
          proposals: proposals.length,
          questions: 0,
          flags: 0,
        },
      };
    };
    const { result } = renderHook(() =>
      useAIForm({
        form: jobApplicationForm,
        transport,
        autoFillOnSource: false,
      }),
    );
    act(() => {
      result.current.sources.addText("resume quote", "resume.txt");
    });
    await act(async () => result.current.fill.run());
    act(() => {
      result.current.field("fullName").accept();
      result.current.field("email").accept();
      result.current.field("phone").setValue("+1 555 123 4567");
    });

    await act(async () => result.current.fill.run());

    expect(secondFillValues).toMatchObject({
      fullName: "Priya Raman",
      email: "priya@example.com",
      phone: "+1 555 123 4567",
      location: null,
    });
    expect(result.current.field("fullName").value).toBe("Priya Raman");
    expect(result.current.field("email").value).toBe("priya@example.com");
    expect(result.current.field("phone").value).toBe("+1 555 123 4567");
    expect(result.current.field("fullName").state.suggestion?.value).toBe(
      "Priya R.",
    );
    expect(result.current.field("email").state.suggestion?.value).toBe(
      "new@example.com",
    );
    expect(result.current.field("phone").state.suggestion?.value).toBe(
      "+1 555 999 0000",
    );
    expect(result.current.field("location").value).toBe("Bengaluru");
  });

  it("keeps mid-stream proposals and retries retryable errors", async () => {
    let calls = 0;
    const transport: FillTransport = async function* (request) {
      calls += 1;
      const fillId = `fill-error-${calls}`;
      const sourceId = request.sources[0]?.id ?? "missing";
      yield { type: "start", fillId, targetFieldIds: [] };
      if (calls === 1) {
        yield proposal(fillId, "fullName", "Priya Raman", sourceId, 0, 5);
        yield {
          type: "error",
          fillId,
          message: "Provider unavailable",
          retryable: true,
        };
        return;
      }
      yield {
        type: "done",
        fillId,
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
    act(() => {
      result.current.sources.addText("Priya Raman", "resume.txt");
    });

    await act(async () => result.current.fill.run());

    expect(result.current.field("fullName").value).toBe("Priya Raman");
    expect(result.current.fill.error).toBe("Provider unavailable");
    expect(result.current.fill.retryable).toBe(true);

    await act(async () => result.current.fill.retry());

    expect(calls).toBe(2);
    expect(result.current.fill.status).toBe("done");
    expect(result.current.fill.retryable).toBe(false);
    expect(result.current.field("fullName").value).toBe("Priya Raman");
  });
});

describe("useAIForm checks before submit", () => {
  const completeValues = {
    fullName: "Priya Raman",
    email: "priya@example.com",
    currentlyEmployed: false,
    workAuthorization: "citizen",
  };

  it("blocks on a new error flag until it is acknowledged", async () => {
    let checks = 0;
    const onSubmit = vi.fn();
    const transport: FillTransport = async function* (request) {
      checks += 1;
      const fillId = `check-submit-${checks}`;
      expect(request.mode).toBe("check");
      yield { type: "start", fillId, targetFieldIds: [] };
      if (checks === 1) {
        yield {
          type: "flag",
          flag: {
            id: "blocking-flag",
            fillId,
            fieldIds: ["fullName", "email"],
            message: "The contact details may belong to different people.",
            severity: "error",
          },
        };
      }
      yield {
        type: "done",
        fillId,
        counts: { proposals: 0, questions: 0, flags: checks === 1 ? 1 : 0 },
      };
    };
    const { result } = renderHook(() =>
      useAIForm({
        form: jobApplicationForm,
        transport,
        autoFillOnSource: false,
        initialValues: completeValues,
        onSubmit,
      }),
    );

    await act(async () => result.current.submit.request());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.submit.status).toBe("idle");
    expect(result.current.submit.blockers).toContainEqual({
      reason: "flag",
      flagId: "blocking-flag",
    });

    act(() => result.current.flags.acknowledge("blocking-flag"));
    await act(async () => result.current.submit.request());

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(result.current.submit.status).toBe("submitted");
  });

  it("allows a warning flag through submission", async () => {
    const onSubmit = vi.fn();
    const transport: FillTransport = async function* () {
      yield { type: "start", fillId: "check-warning", targetFieldIds: [] };
      yield {
        type: "flag",
        flag: {
          id: "warning-flag",
          fillId: "check-warning",
          fieldIds: ["fullName"],
          message: "Double-check the spelling.",
          severity: "warning",
        },
      };
      yield {
        type: "done",
        fillId: "check-warning",
        counts: { proposals: 0, questions: 0, flags: 1 },
      };
    };
    const { result } = renderHook(() =>
      useAIForm({
        form: jobApplicationForm,
        transport,
        autoFillOnSource: false,
        initialValues: completeValues,
        onSubmit,
      }),
    );

    await act(async () => result.current.submit.request());

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(result.current.submit.status).toBe("submitted");
    expect(result.current.submit.blockers).toEqual([]);
    expect(result.current.state.flags[0]?.severity).toBe("warning");
  });

  it("fails open when the pre-submit check errors", async () => {
    const onSubmit = vi.fn();
    const transport: FillTransport = async function* () {
      yield { type: "start", fillId: "check-error", targetFieldIds: [] };
      yield {
        type: "error",
        fillId: "check-error",
        message: "network unavailable",
        retryable: true,
      };
    };
    const { result } = renderHook(() =>
      useAIForm({
        form: jobApplicationForm,
        transport,
        autoFillOnSource: false,
        initialValues: completeValues,
        onSubmit,
      }),
    );

    await act(async () => result.current.submit.request());

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(result.current.submit.status).toBe("submitted");
    expect(result.current.check).toMatchObject({
      status: "error",
      error: "network unavailable",
    });
  });
});

describe("useAIForm sources", () => {
  const idleTransport: FillTransport = async function* () {};

  it("extracts PDF pages and sends only their text to the transport", async () => {
    let serializedBody = "";
    let extractorInput: ArrayBuffer | undefined;
    let finishExtraction!: (result: {
      text: string;
      pageTexts: string[];
    }) => void;
    const extraction = new Promise<{ text: string; pageTexts: string[] }>(
      (resolve) => {
        finishExtraction = resolve;
      },
    );
    const transport: FillTransport = async function* (request) {
      serializedBody = JSON.stringify(request);
      yield { type: "start", fillId: "fill-pdf", targetFieldIds: [] };
      yield {
        type: "done",
        fillId: "fill-pdf",
        counts: { proposals: 0, questions: 0, flags: 0 },
      };
    };
    const { result } = renderHook(() =>
      useAIForm({
        form: jobApplicationForm,
        transport,
        autoFillOnSource: false,
        pdfExtractor: async (data) => {
          extractorInput = data;
          return extraction;
        },
      }),
    );
    const file = new File([new Uint8Array([1, 2, 3])], "resume.pdf", {
      type: "application/pdf",
    });

    let source:
      | Awaited<ReturnType<typeof result.current.sources.addFile>>
      | undefined;
    let addPromise: Promise<NonNullable<typeof source>> | undefined;
    act(() => {
      addPromise = result.current.sources.addFile(file);
    });
    expect(result.current.sources.pending).toEqual(["resume.pdf"]);
    await act(async () => {
      finishExtraction({
        text: "Priya Raman\n\npriya@example.com",
        pageTexts: ["Priya Raman", "priya@example.com"],
      });
      source = await addPromise;
    });
    await act(async () => result.current.fill.run());

    expect(extractorInput).toBeInstanceOf(ArrayBuffer);
    expect(source).toMatchObject({
      name: "resume.pdf",
      kind: "pdf",
      text: "Priya Raman\n\npriya@example.com",
      pageOffsets: [0, 13],
    });
    expect(JSON.parse(serializedBody).sources).toEqual([
      expect.objectContaining({
        name: "resume.pdf",
        kind: "pdf",
        text: "Priya Raman\n\npriya@example.com",
        pageOffsets: [0, 13],
      }),
    ]);
    expect(serializedBody).not.toMatch(/File|ArrayBuffer/);
  });

  it("extracts a generated PDF with the default extractor", async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    document
      .addPage([612, 792])
      .drawText("Priya Raman", { x: 54, y: 738, size: 11, font });
    document.addPage([612, 792]).drawText("priya.raman@example.com", {
      x: 54,
      y: 738,
      size: 11,
      font,
    });
    const bytes = await document.save();
    const fileData = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const file = new File([fileData], "priya-raman.pdf", {
      type: "application/pdf",
    });
    const { result } = renderHook(() =>
      useAIForm({
        form: jobApplicationForm,
        transport: idleTransport,
        autoFillOnSource: false,
      }),
    );

    const source = await act(() => result.current.sources.addFile(file));

    expect(source).toMatchObject({
      name: "priya-raman.pdf",
      kind: "pdf",
      text: "Priya Raman\n\npriya.raman@example.com",
      pageOffsets: [0, 13],
    });
    expect(result.current.sources.list).toContainEqual(source);
    expect(result.current.sources.error).toBeNull();
  });

  it("surfaces PDF extraction errors until the next successful add", async () => {
    const { result } = renderHook(() =>
      useAIForm({
        form: jobApplicationForm,
        transport: idleTransport,
        autoFillOnSource: false,
        pdfExtractor: async () => {
          throw new Error("Encrypted PDF");
        },
      }),
    );

    await act(async () => {
      await expect(
        result.current.sources.addFile(
          new File([new Uint8Array([1])], "locked.pdf"),
        ),
      ).rejects.toThrow("Could not extract locked.pdf: Encrypted PDF");
    });
    expect(result.current.sources.pending).toEqual([]);
    expect(result.current.sources.error).toBe(
      "Could not extract locked.pdf: Encrypted PDF",
    );

    act(() => {
      result.current.sources.addText("replacement", "notes.txt");
    });
    expect(result.current.sources.error).toBeNull();
  });
});

describe("field input props", () => {
  const idleTransport: FillTransport = async function* () {};

  it("coerces clean number and checkbox changes immediately", () => {
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
    act(() => result.current.field("gradYear").inputProps.onBlur());

    expect(result.current.field("gradYear").value).toBe(2024);
    expect(result.current.field("gradYear").normalization).toBeNull();
    expect(result.current.field("currentlyEmployed").value).toBe(true);
  });
});
