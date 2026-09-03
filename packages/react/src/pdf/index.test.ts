// @vitest-environment node

import { loadResume } from "@ai-native-forms/examples";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createPdfExtractor, extractPdfText } from "./index";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function generatedResumePdf(): Promise<ArrayBuffer> {
  const resume = loadResume("priya-raman.txt");
  const fixtureText = resume.split("\n").slice(0, 4).join("\n");
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const font = await document.embedFont(StandardFonts.Helvetica);

  fixtureText.split("\n").forEach((line, index) => {
    page.drawText(line, { x: 54, y: 738 - index * 20, size: 11, font });
  });

  const bytes = await document.save();
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe("extractPdfText", () => {
  it("extracts per-page text from a generated resume PDF", async () => {
    const result = await extractPdfText(await generatedResumePdf());

    expect(result.text).toContain("Priya Raman");
    expect(result.text).toContain("priya.raman@example.com");
    expect(result.pageTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("does not construct a worker by default", async () => {
    const WorkerSpy = vi.fn();
    vi.stubGlobal("Worker", WorkerSpy);

    const result = await createPdfExtractor()(await generatedResumePdf());

    expect(result.text).toContain("Priya Raman");
    expect(WorkerSpy).not.toHaveBeenCalled();
  });

  it("times out an unresponsive worker after 30 seconds", async () => {
    vi.useFakeTimers();
    const terminate = vi.fn();
    class HangingWorker {
      onmessage = null;
      onerror = null;

      postMessage(): undefined {
        return undefined;
      }

      terminate(): void {
        terminate();
      }
    }
    vi.stubGlobal("Worker", HangingWorker);

    const extraction = createPdfExtractor({ worker: true })(new ArrayBuffer(1));
    const rejection = expect(extraction).rejects.toThrow(
      "PDF extraction timed out after 30 seconds",
    );
    await vi.advanceTimersByTimeAsync(30_000);

    await rejection;
    expect(terminate).toHaveBeenCalledOnce();
  });
});
