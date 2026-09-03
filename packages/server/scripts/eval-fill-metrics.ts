import type { FillEvent } from "@ai-native-forms/core";

export interface TimedFillEvents {
  events: FillEvent[];
  firstItemMs: number | null;
  latencyMs: number;
}

export async function collectTimedFillEvents(
  stream: AsyncIterable<FillEvent>,
  now: () => number = () => performance.now(),
): Promise<TimedFillEvents> {
  const started = now();
  const events: FillEvent[] = [];
  let firstItemMs: number | null = null;

  for await (const event of stream) {
    events.push(event);
    if (
      firstItemMs === null &&
      (event.type === "proposal" || event.type === "question")
    ) {
      firstItemMs = Math.round(now() - started);
    }
  }

  return {
    events,
    firstItemMs,
    latencyMs: Math.round(now() - started),
  };
}
