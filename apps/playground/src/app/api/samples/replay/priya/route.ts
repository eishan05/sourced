import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createFakeAdapter } from "@ai-native-forms/server";
import { createNextFillRoute } from "@ai-native-forms/server/next";

export const runtime = "nodejs";

const replayPath = resolve(
  process.cwd(),
  "../../packages/server/fixtures/replays/openai-gpt-5-6-luna/priya-raman.jsonl",
);
const replayItems = readFileSync(replayPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const { sourceId: _sourceId, ...item } = JSON.parse(line) as Record<
      string,
      unknown
    >;
    return item;
  });

export const { POST } = createNextFillRoute({
  adapter: createFakeAdapter(replayItems),
});
