import { type FillOptions, fill } from "./fill";
import { toNdjsonResponse } from "./ndjson";
import { FillRequestSchema } from "./schema";

export interface FillHandlerOptions extends FillOptions {
  maxBodyBytes?: number;
  pingMs?: number;
}

function jsonError(
  status: number,
  message: string,
  details?: unknown,
): Response {
  return Response.json(
    { error: message, ...(details === undefined ? {} : { details }) },
    { status },
  );
}

async function readBody(
  request: Request,
  limit: number,
): Promise<{ text?: string; tooLarge: boolean }> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    return { tooLarge: true };
  }
  if (!request.body) {
    return { text: "", tooLarge: false };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return { tooLarge: true };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return { text, tooLarge: false };
  } finally {
    reader.releaseLock();
  }
}

export function createFillHandler(
  opts: FillHandlerOptions,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") {
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    }

    const body = await readBody(request, opts.maxBodyBytes ?? 4 * 1024 * 1024);
    if (body.tooLarge) {
      return jsonError(413, "Request body is too large");
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(body.text ?? "");
    } catch {
      return jsonError(400, "Request body must be valid JSON");
    }
    const parsed = FillRequestSchema.safeParse(decoded);
    if (!parsed.success) {
      return jsonError(400, "Invalid fill request", parsed.error.issues);
    }

    return toNdjsonResponse(
      fill(parsed.data, { ...opts, signal: request.signal }),
      { pingMs: opts.pingMs, signal: request.signal },
    );
  };
}
