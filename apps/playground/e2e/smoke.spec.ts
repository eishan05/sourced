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
  const submitted = page.getByRole("heading", { name: "Submitted" });
  await expect(submitted).toBeVisible();

  await page.screenshot({
    path: join(__dirname, "__screenshots__", `${testInfo.project.name}.png`),
    fullPage: true,
  });
});
