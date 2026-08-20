import { test, expect } from "@playwright/test";

test("public landing and auth affordances are available", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /know what is known/i }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /create account/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/auth\/sign-up/);
  await expect(
    page.getByRole("heading", { name: /create your recourse account/i }),
  ).toBeVisible();
  await page.getByRole("link", { name: /already have an account/i }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in/);
});

test("auth form validates before calling the backend", async ({ page }) => {
  await page.goto("/auth/sign-in");
  await page.getByRole("textbox", { name: "Email" }).fill("not-an-email");
  await page.getByLabel("Password").fill("");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/valid email address/i)).toBeVisible();
  await expect(page.getByText(/enter your password/i)).toBeVisible();
});

test("password reset request is enumeration-safe and incomplete links fail closed", async ({
  page,
}) => {
  await page.goto("/auth/forgot-password");
  await page.getByRole("textbox", { name: "Email" }).fill("not-an-email");
  await page.getByRole("button", { name: /send reset link/i }).click();
  await expect(page.getByText(/valid email address/i)).toBeVisible();

  await page
    .getByRole("textbox", { name: "Email" })
    .fill("missing-account@invalid.example");
  await page.getByRole("button", { name: /send reset link/i }).click();
  await expect(page.getByText(/if an active account matches/i)).toBeVisible();

  await page.goto("/auth/reset-password");
  await expect(page.getByText(/reset link is incomplete/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /change password/i }),
  ).toBeDisabled();
});

test.describe("real authenticated case flow", () => {
  test.skip(
    !process.env.E2E_REAL_BACKEND,
    "Set E2E_REAL_BACKEND=1 with a real API and test account to run this flow.",
  );

  test("creates and reviews a case without crossing the external action boundary", async ({
    page,
  }) => {
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    if (!email || !password)
      throw new Error(
        "E2E_EMAIL and E2E_PASSWORD are required when E2E_REAL_BACKEND=1.",
      );
    await page.goto("/auth/sign-in");
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page
      .getByRole("link", { name: /start a case|new case/i })
      .first()
      .click();
    await page
      .getByRole("textbox", { name: "Case title" })
      .fill("Playwright review case");
    await page.getByRole("button", { name: /create case/i }).click();
    await expect(page).toHaveURL(/\/cases\/[a-f0-9]+/);
    await expect(
      page.getByText(/what recourse knows right now/i),
    ).toBeVisible();
    await page.getByRole("link", { name: "Decision" }).click();
    await expect(page.getByText(/review extracted fields/i)).toBeVisible();
    await page.getByRole("link", { name: "Evidence" }).click();
    await expect(page.getByText(/evidence ledger/i)).toBeVisible();
  });
});
