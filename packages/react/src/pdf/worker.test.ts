import { afterEach, describe, expect, it, vi } from "vitest";

import { createPdfExtractor } from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PDF extraction worker protocol", () => {
  it("ignores pdf.js messages before the tagged worker result", async () => {
    const terminate = vi.fn();
    const workerResult = {
      text: "Priya Raman\n\npriya.raman@example.com",
      pageTexts: ["Priya Raman", "priya.raman@example.com"],
    };
    class HandshakeWorker {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;

      postMessage(message: unknown): void {
        expect(message).toMatchObject({ type: "anf-pdf-extract" });
        queueMicrotask(() => {
          this.onmessage?.(
            new MessageEvent("message", {
              data: {
                sourceName: "worker",
                targetName: "main",
                action: "ready",
                data: null,
              },
            }),
          );
          this.onmessage?.(
            new MessageEvent("message", {
              data: {
                type: "anf-pdf-result",
                ok: true,
                result: workerResult,
              },
            }),
          );
        });
      }

      terminate(): void {
        terminate();
      }
    }
    vi.stubGlobal("Worker", HandshakeWorker);

    await expect(
      createPdfExtractor({ worker: true })(new ArrayBuffer(1)),
    ).resolves.toEqual(workerResult);
    expect(terminate).toHaveBeenCalledOnce();
  });
});
