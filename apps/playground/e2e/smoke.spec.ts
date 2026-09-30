import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { hasSystemChrome } from "../playwright.config";

test.skip(!hasSystemChrome, "System Chrome is not available");

test("completes the Priya application with the fake transport", async ({
  page,
}, testInfo) => {
  await page.goto("/job-application?transport=fake");

  if (testInfo.project.name === "mobile-390") {
    await page.getByRole("button", { name: "Sources (0)" }).click();
  }
  await page.getByRole("button", { name: "Load Priya" }).click();
  await expect(
    page.getByText("9 fields filled, 3 suggested. Review them."),
  ).toBeVisible();
  if (testInfo.project.name === "mobile-390") {
    await page.getByRole("button", { name: "Sources (1)" }).click();
  }

  await page.getByRole("button", { name: "Start review" }).click();
  for (let index = 0; index < 15; index += 1) {
    await page.keyboard.press("Enter");
  }
  await expect(page.getByText("All reviewed")).toBeVisible();

  await page
    .getByRole("combobox", { name: "Work authorization" })
    .selectOption("citizen");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  const submitted = page.getByRole("heading", { name: "Validated on server" });
  await expect(submitted).toBeVisible();
  await expect(
    page.getByText("This demo does not save submissions."),
  ).toBeVisible();

  await page.screenshot({
    path: join(__dirname, "__screenshots__", `${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test("validates submission payloads against server-owned forms", async ({
  request,
}) => {
  const valid = {
    fullName: "Priya Raman",
    email: "priya@example.com",
    currentlyEmployed: false,
    workAuthorization: "citizen",
  };
  const submit = (formId: string, values: unknown, formVersion = 1) =>
    request.post("/api/submissions", { data: { formId, formVersion, values } });
  const response = await submit("job-application", {
    ...valid,
    employer: "Hidden employer",
  });
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.values).not.toHaveProperty("employer");
  expect(
    (await submit("medical-intake", { consentToTreatment: true })).status(),
  ).toBe(200);
  expect(
    (await submit("job-application", { ...valid, email: "invalid" })).status(),
  ).toBe(422);
  expect(
    (await submit("job-application", { ...valid, unknown: "x" })).status(),
  ).toBe(422);
  expect((await submit("job-application", {})).status()).toBe(422);
  expect((await submit("job-application", valid, 999)).status()).toBe(409);
  expect((await submit("unknown", valid)).status()).toBe(404);
  expect((await request.post("/api/submissions", { data: "{" })).status()).toBe(
    400,
  );
});

test("retries a failed check and server request without losing medical intake answers", async ({
  page,
}) => {
  let checks = 0;
  await page.route("**/api/ai-forms/fill", async (route) => {
    checks++;
    expect(route.request().postDataJSON().mode).toBe("check");
    if (checks === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Check service unavailable" }),
      });
    } else {
      await route.fulfill({
        contentType: "application/x-ndjson",
        body:
          [
            { type: "start", fillId: "check", targetFieldIds: [] },
            {
              type: "done",
              fillId: "check",
              counts: { proposals: 0, questions: 0, flags: 0 },
            },
          ]
            .map((event) => JSON.stringify(event))
            .join("\n") + "\n",
      });
    }
  });
  let submissions = 0;
  await page.route("**/api/submissions", async (route) => {
    submissions++;
    if (submissions === 1)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Submission service unavailable. Retry.",
        }),
      });
    else await route.continue();
  });
  await page.goto("/medical-intake");
  await page
    .getByRole("textbox", { name: "Full name", exact: true })
    .fill("Maya Chen");
  await page
    .getByRole("group", { name: "I consent to treatment" })
    .getByRole("button", { name: "Yes", exact: true })
    .click();
  const submit = page.getByRole("button", { name: "Submit", exact: true });
  await submit.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "AI check could not complete" }),
  ).toBeVisible();
  expect(submissions).toBe(0);
  await expect(
    page.getByRole("heading", { name: "Validated on server" }),
  ).toHaveCount(0);
  await submit.click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Submission service unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Full name", exact: true }),
  ).toHaveValue("Maya Chen");
  await submit.click();
  await expect(
    page.getByRole("heading", { name: "Validated on server" }),
  ).toBeVisible();
  await expect(
    page.getByText("This demo does not save submissions."),
  ).toBeVisible();
});
