import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include:
      process.env.SOURCED_LIVE_TESTS === "1"
        ? ["src/**/*.live.test.ts"]
        : ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude:
      process.env.SOURCED_LIVE_TESTS === "1" ? [] : ["src/**/*.live.test.ts"],
  },
});
