import { test, expect, type Page } from "@playwright/test";
import path from "path";

// End-to-end coverage of the full onboarding wizard -> submit -> status ->
// report flow, against a real dev server + Inngest dev server running
// GEN_MODE=mock (instant, no AI call, no rate-limit burn — see README/CLAUDE.md
// for why claude-code/api modes must never be used in this automated loop).
//
// BROWSER ISOLATION: this spec only ever drives Playwright's own bundled,
// headless Chromium (configured in playwright.config.ts) — never the
// developer's real Chrome.

const FIXTURE_CHAT = path.join(__dirname, "..", "fixtures", "sample-chat.txt");
const FIXTURE_COVER = path.join(__dirname, "..", "fixtures", "cover.png");

async function walkWizard(
  page: Page,
  { attachCover }: { attachCover: boolean },
) {
  await page.goto("/get-report");

  // Step 1 — language (default "English" is fine as-is).
  await page.getByRole("button", { name: "Continue →" }).click();

  // Step 2 — chat type.
  await page.getByText("Friends group").click();
  await page.getByRole("button", { name: "Continue →" }).click();

  // Step 3 — free-form context (skip).
  await page.getByRole("button", { name: /Skip →|Continue →/ }).click();

  // Step 4 — platform (WhatsApp already selected by default).
  await page.getByRole("button", { name: "Continue →" }).click();

  // Step 5 — teaser.
  await page.getByRole("button", { name: "Continue to upload →" }).click();

  // Step 6 — upload the fixture chat export.
  await page
    .locator('input[type="file"][accept=".zip,.txt"]')
    .setInputFiles(FIXTURE_CHAT);
  await expect(page.getByText(/good signal/i)).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Continue →" }).click();

  // Step 7 — participants.
  await page.getByRole("button", { name: "Continue →" }).click();

  // Step 8 — name review / merge (leave as-is; out of scope for this spec).
  await page.getByRole("button", { name: "Confirm →" }).click();

  // Step 9 — cover photo (optional). When attached, confirm a real preview
  // thumbnail renders (not just a filename) and the remove control works.
  if (attachCover) {
    await page
      .locator('input[type="file"][accept="image/*"]')
      .setInputFiles(FIXTURE_COVER);
    await expect(page.getByAltText("Cover preview")).toBeVisible();
    await expect(page.getByText("cover.png")).toBeVisible();
  }
  await page.getByRole("button", { name: "Continue →" }).click();

  // Step 10 — report flavor (Classic is the only option).
  await page.getByRole("button", { name: "Continue →" }).click();

  // Step 11 — email + generate.
  await page.getByPlaceholder("you@email.com").fill("e2e-test@example.com");
  await page.getByRole("button", { name: /Generate my report/ }).click();
}

async function assertPostSubmitFlow(page: Page) {
  // Submit -> status page.
  await expect(page).toHaveURL(/\/status\//, { timeout: 10_000 });
  await expect(
    page.getByText(/is reading your chat/i),
  ).toBeVisible();
  // Bouncing-dots wait animation + rotating sub-message (app/status/[token]/page.tsx).
  await expect(page.locator("span.inline-block.rounded-full")).toHaveCount(3);
  await expect(page.getByText(/getting in line|reading every message/i)).toBeVisible();

  // Auto-redirect to the rendered report — no click needed.
  await expect(page).toHaveURL(/\/r\//, { timeout: 15_000 });
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator(".report-prose")).toBeVisible();
}

function trackPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
  });
  page.on("requestfailed", (req) => {
    // Next.js's client router cancels in-flight RSC prefetch requests
    // (`?_rsc=...`) when navigation continues past them — a normal artifact
    // of client-side routing, not a real failure.
    if (req.failure()?.errorText === "net::ERR_ABORTED") return;
    errors.push(`requestfailed: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });
  return errors;
}

test("full wizard with a cover photo attached", async ({ page }) => {
  const errors = trackPageErrors(page);
  await walkWizard(page, { attachCover: true });
  await assertPostSubmitFlow(page);
  expect(errors, `unexpected page errors:\n${errors.join("\n")}`).toEqual([]);
});

test("full wizard skipping the cover photo", async ({ page }) => {
  const errors = trackPageErrors(page);
  await walkWizard(page, { attachCover: false });
  await assertPostSubmitFlow(page);
  expect(errors, `unexpected page errors:\n${errors.join("\n")}`).toEqual([]);
});

test("cover photo: preview, remove, and replace all work", async ({ page }) => {
  await page.goto("/get-report");
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByText("Friends group").click();
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByRole("button", { name: /Skip →|Continue →/ }).click();
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByRole("button", { name: "Continue to upload →" }).click();
  await page
    .locator('input[type="file"][accept=".zip,.txt"]')
    .setInputFiles(FIXTURE_CHAT);
  await expect(page.getByText(/good signal/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByRole("button", { name: "Confirm →" }).click();

  // Before selecting: the plain "add a photo" drop zone, no preview.
  await expect(page.getByText("Add a photo (optional)")).toBeVisible();
  await expect(page.getByAltText("Cover preview")).toHaveCount(0);

  // Select -> real thumbnail preview appears.
  await page
    .locator('input[type="file"][accept="image/*"]')
    .setInputFiles(FIXTURE_COVER);
  await expect(page.getByAltText("Cover preview")).toBeVisible();
  await expect(page.getByText("cover.png")).toBeVisible();

  // Remove -> back to the empty drop zone, no leftover preview.
  await page.getByRole("button", { name: "Remove cover photo" }).click();
  await expect(page.getByAltText("Cover preview")).toHaveCount(0);
  await expect(page.getByText("Add a photo (optional)")).toBeVisible();

  // Replace: select again via the drop zone, then use "Change photo".
  await page
    .locator('input[type="file"][accept="image/*"]')
    .setInputFiles(FIXTURE_COVER);
  await expect(page.getByAltText("Cover preview")).toBeVisible();
  await page.getByText("Change photo").locator("..").locator('input[type="file"]').setInputFiles(FIXTURE_COVER);
  await expect(page.getByAltText("Cover preview")).toBeVisible();
});

test("redirect happens even if the cover file is corrupt/invalid", async ({
  page,
}) => {
  // Directly probes "a failing/throwing cover upload must NOT silently
  // swallow the redirect" — setInputFiles bypasses the accept attribute, so
  // this attaches a non-image file as the cover to try to break the
  // upload path server-side while confirming the client still redirects.
  const errors = trackPageErrors(page);
  const corruptCover = path.join(__dirname, "..", "fixtures", "sample-chat.txt");

  await page.goto("/get-report");
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByText("Friends group").click();
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByRole("button", { name: /Skip →|Continue →/ }).click();
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByRole("button", { name: "Continue to upload →" }).click();
  await page
    .locator('input[type="file"][accept=".zip,.txt"]')
    .setInputFiles(FIXTURE_CHAT);
  await expect(page.getByText(/good signal/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByRole("button", { name: "Confirm →" }).click();

  // Attach a corrupt "cover" (a .txt file bypassing the accept filter).
  await page
    .locator('input[type="file"][accept="image/*"]')
    .setInputFiles(corruptCover);
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByRole("button", { name: "Continue →" }).click();
  await page.getByPlaceholder("you@email.com").fill("e2e-test@example.com");
  await page.getByRole("button", { name: /Generate my report/ }).click();

  await assertPostSubmitFlow(page);
  expect(errors, `unexpected page errors:\n${errors.join("\n")}`).toEqual([]);
});
