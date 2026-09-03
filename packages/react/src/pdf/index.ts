import { extractText } from "unpdf";

export interface PdfText {
  text: string;
  pageTexts: string[];
}

export type PdfExtractor = (data: ArrayBuffer) => Promise<PdfText>;

const EXTRACTION_TIMEOUT_MS = 30_000;

function timeoutError(): Error {
  return new Error("PDF extraction timed out after 30 seconds");
}

function withTimeout<T>(
  promise: Promise<T>,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(timeoutError());
    }, EXTRACTION_TIMEOUT_MS);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function extractPdfText(
  data: ArrayBuffer | Uint8Array,
): Promise<PdfText> {
  const { text } = await extractText(
    data instanceof Uint8Array ? data : new Uint8Array(data),
    { mergePages: false },
  );
  const pageTexts = Array.isArray(text) ? text : [text];
  return { text: pageTexts.join("\n\n"), pageTexts };
}

function isPdfWorkerResponse(message: unknown): message is PdfWorkerResponse {
  return (
    message !== null &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "anf-pdf-result"
  );
}

function extractInWorker(data: ArrayBuffer): Promise<PdfText> {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
  } catch {
    return withTimeout(extractPdfText(data));
  }

  const extraction = new Promise<PdfText>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (!isPdfWorkerResponse(event.data)) return;

      worker.terminate();
      if (event.data.ok) {
        resolve(event.data.result);
      } else {
        reject(new Error(event.data.error));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "PDF extraction worker failed"));
    };
    const request: PdfWorkerRequest = { type: "anf-pdf-extract", data };
    worker.postMessage(request, [data]);
  });

  return withTimeout(extraction, () => worker.terminate());
}

export function createPdfExtractor(options?: {
  worker?: boolean;
}): PdfExtractor {
  return (data) =>
    options?.worker ? extractInWorker(data) : withTimeout(extractPdfText(data));
}

export interface PdfWorkerRequest {
  type: "anf-pdf-extract";
  data: ArrayBuffer;
}

export type PdfWorkerResponse =
  | { type: "anf-pdf-result"; ok: true; result: PdfText }
  | { type: "anf-pdf-result"; ok: false; error: string };
