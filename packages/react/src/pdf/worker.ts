import { extractText } from "unpdf";

import type { PdfWorkerRequest, PdfWorkerResponse } from "./index";

interface PdfWorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: PdfWorkerResponse): void;
}

const workerScope = globalThis as unknown as PdfWorkerScope;

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message || error.name || "Unknown error";
    return error.stack ? `${message}\n${error.stack}` : message;
  }
  if (error !== null && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

workerScope.onmessage = async (event) => {
  const request = event.data as Partial<PdfWorkerRequest> | null;
  if (request?.type !== "anf-pdf-extract" || !request.data) return;

  try {
    const { text } = await extractText(new Uint8Array(request.data), {
      mergePages: false,
    });
    const pageTexts = Array.isArray(text) ? text : [text];
    workerScope.postMessage({
      type: "anf-pdf-result",
      ok: true,
      result: { text: pageTexts.join("\n\n"), pageTexts },
    });
  } catch (error) {
    workerScope.postMessage({
      type: "anf-pdf-result",
      ok: false,
      error: describeError(error),
    });
  }
};
