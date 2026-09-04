import { createOpenRouterAdapter } from "@sourced/server";
import { createNextFillRoute } from "@sourced/server/next";

export const runtime = "nodejs";
export const maxDuration = 60;

function route() {
  if (!process.env.OPENROUTER_API_KEY) {
    return {
      POST: async () =>
        Response.json(
          {
            error:
              "OPENROUTER_API_KEY is missing. Add it to apps/playground/.env.local and restart the playground.",
          },
          { status: 500 },
        ),
    };
  }

  return createNextFillRoute({
    adapter: createOpenRouterAdapter(),
  });
}

export const { POST } = route();
