import { test, expect, type Page } from "@playwright/test";
import { E2E_USERNAME, E2E_PASSWORD } from "../../playwright.config";

/**
 * The five journeys the brief calls out as genuinely bad to break — login,
 * onboarding, a task completion persisting, a camp's reward popup, and the
 * summit celebration — run as one continuous story against a single seeded
 * climb. Onboarding is trimmed to 2 camps plus the separate, fixed summit
 * (so each task's auto-calculated weight lands exactly on the shared
 * threshold), then camp tasks are completed *out of onboarding order* to
 * prove camp order on the mountain is earned by completion. The summit is
 * left with no tasks at all and reached via its own button once every camp
 * is done, proving it doesn't need app-tracked tasks. Deliberately minimal:
 * this is not a UI regression suite.
 */
test.describe.serial("Adam's Ascent critical journeys", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("1. login redirects to the dashboard", async () => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);

    await page.fill('input[name="username"]', E2E_USERNAME);
    await page.fill('input[name="password"]', E2E_PASSWORD);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Adam's Ascent" })).toBeVisible();
  });

  test("2. first-time onboarding ends on a working dashboard with what he set", async () => {
    await expect(page.getByRole("button", { name: "Let's go" })).toBeVisible();
    await page.getByRole("button", { name: "Let's go" }).click();

    await expect(page.getByText("The camps along the way")).toBeVisible();

    // Trim the default 5 non-summit camps down to 2 (Research courses,
    // Enrol) — the summit ("Summit: first client") lives in its own
    // separate, non-removable section — so each task's auto-calculated
    // weight lands exactly on the shared threshold. Camp titles live in an
    // <input> value, not static text, so locate rows by that input's value.
    for (const title of ["Core modules", "Placement hours", "Certification"]) {
      await page
        .locator("li")
        .filter({ has: page.locator(`input[value="${title}"]`) })
        .getByRole("button", { name: "Remove" })
        .click();
    }
    const campRows = page.locator('input[placeholder="Camp name"]');
    await expect(campRows).toHaveCount(2);
    await expect(page.locator('input[placeholder="Summit name"]')).toHaveValue("Summit: first client");

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("A few things to start with")).toBeVisible();

    // Tasks are now grouped into a section per camp instead of a dropdown —
    // one task each under Research courses and Enrol; the summit section is
    // left empty entirely, since it doesn't need tasks to be reached. The
    // `> h3` direct-child match picks out the exact section div, not an
    // outer wrapper that merely contains the heading somewhere inside it.
    const researchSection = page.locator('div:has(> h3:text-is("Research courses"))');
    await researchSection.getByRole("button", { name: "Add another" }).click();
    await researchSection.getByPlaceholder(/PT courses/).fill("Task A");

    const enrolSection = page.locator('div:has(> h3:text-is("Enrol"))');
    await enrolSection.getByRole("button", { name: "Add another" }).click();
    await enrolSection.getByPlaceholder(/PT courses/).fill("Task B");

    await page.getByRole("button", { name: "Start the climb" }).click();

    // Both camps are freely selectable — no locking. Task A shows first
    // since it's the first tab in onboarding order. The summit is locked
    // until every camp is done.
    await expect(page.getByText("Task A")).toBeVisible();
    await expect(page.getByRole("tab", { name: /🔒.*Summit: first client/ })).toBeVisible();
  });

  test("3. completing a task in the second-listed camp first still lets it claim line 1", async () => {
    await expect(page.getByText("0 / 5000m")).toBeVisible();

    // Switch to Enrol (listed second) before touching Research courses at
    // all, to prove camps can be worked in any order.
    await page.getByRole("tab", { name: /Enrol/ }).click();
    await expect(page.getByText("Task B")).toBeVisible();

    await page.getByRole("button", { name: 'Mark "Task B" done' }).click();
    await expect(page.getByText("1666 / 5000m")).toBeVisible();

    // Finishing a camp's last task claims a mountain line immediately — no
    // separate confirmation step.
    const popup = page.getByRole("dialog", { name: "Enrol" });
    await expect(popup).toBeVisible();
    await popup.getByRole("button", { name: "Keep climbing" }).click();

    await page.reload();
    await expect(page.getByText("1666 / 5000m")).toBeVisible();
    await expect(page.getByRole("tab", { name: /✓#1 Enrol/ })).toBeVisible();
  });

  test("4. reaching a milestone shows the reward popup and unlocks the summit", async () => {
    // Research courses was listed first in onboarding but finishes second
    // — it still just claims the next open camp line, nothing special.
    await page.getByRole("tab", { name: /Research courses/ }).click();
    await page.getByRole("button", { name: 'Mark "Task A" done' }).click();
    await expect(page.getByText("3333 / 5000m")).toBeVisible();

    const popup = page.getByRole("dialog", { name: "Research courses" });
    await expect(popup.getByText("Camp reached")).toBeVisible();
    await popup.getByRole("button", { name: "Keep climbing" }).click();
    await expect(popup).not.toBeVisible();

    // Every camp is done now — the summit unlocks (still unreached itself,
    // since it has no tasks of its own to auto-complete it).
    await expect(page.getByRole("tab", { name: /🏔 Summit: first client/ })).toBeEnabled();
  });

  test("5. reaching the summit shows the celebration and keep-going/descend choice", async () => {
    // The summit has no tasks at all — it's reached directly via its own
    // button, proving it doesn't need app-tracked tasks.
    await page.getByRole("tab", { name: /Summit: first client/ }).click();
    await page.getByRole("button", { name: "Reach the Summit" }).click();

    await expect(page.getByText("You made it.")).toBeVisible();
    await page.fill('input[placeholder="e.g. A weekend away"]', "A well-earned rest");
    await page.getByRole("button", { name: "Lock it in" }).click();

    await expect(page.getByText("Adam sees another mountain in the distance.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep going" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Begin descent" })).toBeVisible();

    await page.getByRole("button", { name: "Begin descent" }).click();
    await expect(page.getByText(/You reached the end of/)).toBeVisible();
  });
});
