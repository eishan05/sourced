import { defineForm } from "@sourced/core";
import { jobApplicationForm, medicalIntakeForm } from "@sourced/examples/forms";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validateSubmission } from "./submission";

const values = {
  fullName: "Priya Raman",
  email: "priya@example.com",
  currentlyEmployed: false,
  workAuthorization: "citizen",
};

describe("validateSubmission", () => {
  it("validates both demos and returns only visible values", () => {
    const result = validateSubmission(jobApplicationForm, {
      ...values,
      employer: "Hidden employer",
      startDate: "invalid",
    });
    expect(result).toMatchObject({
      success: true,
      values: { ...values, phone: null },
    });
    if (result.success) {
      expect(result.values).not.toHaveProperty("employer");
      expect(result.values).not.toHaveProperty("startDate");
    }
    expect(
      validateSubmission(medicalIntakeForm, { consentToTreatment: true }),
    ).toMatchObject({ success: true });
  });

  it.each([
    null,
    [],
    "text",
    { fullName: {} },
    { fullName: [1] },
    { yearsExperience: Number.NaN },
  ])("rejects malformed payload %j", (input) => {
    expect(validateSubmission(jobApplicationForm, input)).toMatchObject({
      success: false,
      issues: [{ code: "invalid_payload" }],
    });
  });

  it.each([
    [{ ...values, unknown: "x" }, "unknown", "unknown_field"],
    [{ ...values, fullName: "" }, "fullName", "required"],
    [{ ...values, email: "invalid" }, "email", "email_format"],
    [
      { ...values, workAuthorization: "invented" },
      "workAuthorization",
      "option",
    ],
    [{ ...values, yearsExperience: "12" }, "yearsExperience", "type_mismatch"],
    [{ ...values, yearsExperience: 99 }, "yearsExperience", "range"],
    [{ ...values, employeeId: "abc" }, "employeeId", "pattern"],
    [{ ...values, skills: ["go", "go"] }, "skills", "option"],
  ])("rejects invalid values without coercion", (input, fieldId, code) => {
    expect(validateSubmission(jobApplicationForm, input)).toMatchObject({
      success: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ fieldId, code }),
      ]),
    });
  });

  it("runs the server-owned custom validator", () => {
    const form = defineForm({
      id: "custom",
      title: "Custom",
      version: 1,
      sections: [
        {
          id: "s",
          title: "S",
          fields: [
            {
              id: "code",
              label: "Code",
              type: "text",
              validate: z.string().startsWith("APP-"),
            },
          ],
        },
      ],
    });
    expect(validateSubmission(form, { code: "wrong" })).toMatchObject({
      success: false,
      issues: [{ fieldId: "code", code: "custom" }],
    });
  });
});
