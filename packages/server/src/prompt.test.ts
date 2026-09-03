import { type FillRequest, serializeForm } from "@ai-native-forms/core";
import { jobApplicationForm } from "@ai-native-forms/examples";
import { describe, expect, it } from "vitest";

import { buildPrompt } from "./prompt";

const request: FillRequest = {
  form: serializeForm(jobApplicationForm),
  sources: [
    {
      id: "resume",
      name: "Resume",
      kind: "paste",
      text: "Priya Raman",
      addedAt: 0,
    },
  ],
  mode: "fill",
  today: "2026-09-03",
};

describe("buildPrompt", () => {
  it("excludes human fields and includes the source verbatim", () => {
    const result = buildPrompt(request);
    expect(result.prompt).toContain("Priya Raman");
    expect(result.prompt).toContain('"fullName"');
    expect(result.prompt).not.toContain('"workAuthorization"');
    expect(result.system).toContain("Today is 2026-09-03");
    expect(result.system).toContain(
      "Every option must include the candidate's verbatim quote and sourceId",
    );
    expect(result.system).toContain('"kind":"question"');
  });

  it("adds current values and check-mode instructions", () => {
    const result = buildPrompt({
      ...request,
      mode: "check",
      currentValues: { fullName: "P. Raman" },
    });
    expect(result.prompt).toContain("<current_values>");
    expect(result.system).toContain("emit only flag and question");
  });

  it("protects non-empty current values in fill mode", () => {
    const result = buildPrompt({
      ...request,
      currentValues: { fullName: "Priya Raman", email: null },
    });
    expect(result.prompt).toContain("<current_values>");
    expect(result.prompt).toContain('"fullName":"Priya Raman"');
    expect(result.system).toContain(
      "propose only for fields whose current value is empty",
    );
    expect(result.system).toContain("only when strong verbatim evidence");
  });
});
