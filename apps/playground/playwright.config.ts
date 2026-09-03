import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

const chromeNames =
  process.platform === "win32"
    ? ["chrome.exe"]
    : ["google-chrome", "google-chrome-stable", "chrome"];
const chromePaths = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
  join(process.env.PROGRAMFILES ?? "", "Google/Chrome/Application/chrome.exe"),
  ...(process.env.PATH ?? "")
    .split(delimiter)
    .flatMap((directory) => chromeNames.map((name) => join(directory, name))),
];

export const hasSystemChrome = chromePaths.some(
  (path) => path.length > 0 && existsSync(path),
);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./.next/playwright-results",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-1280",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: "mobile-390",
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/job-application?transport=fake",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
