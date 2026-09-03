import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("forms entry", () => {
  it("loads the browser-safe form definitions without bundling node:fs", async () => {
    const entryUrl = new URL("../dist/forms.js", import.meta.url);
    const builtSource = readFileSync(entryUrl, "utf8");
    const entry = (await import(entryUrl.href)) as {
      jobApplicationForm: { id: string };
    };

    expect(entry.jobApplicationForm.id).toBe("job-application");
    expect(builtSource).not.toContain("node:fs");
  });
});
