import { createFillHandler, type FillHandlerOptions } from "./handler";

/**
 * Creates a Next.js route handler without adding Next.js as a dependency.
 *
 * @example app/api/fill/route.ts
 * ```ts
 * import { createNextFillRoute } from "@sourced/server/next";
 * import { createOpenRouterAdapter } from "@sourced/server";
 *
 * export const runtime = "nodejs";
 * export const maxDuration = 60;
 * export const { POST } = createNextFillRoute({
 *   adapter: createOpenRouterAdapter(),
 * });
 * ```
 */
export function createNextFillRoute(opts: FillHandlerOptions): {
  POST: (request: Request) => Promise<Response>;
} {
  return { POST: createFillHandler(opts) };
}
