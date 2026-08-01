import { expect, test, type Page } from "@playwright/test";

const STRIPE_CHECKOUT_HOST = "checkout.stripe.com";

async function expectStripeCheckout(page: Page, click: () => Promise<void>) {
  await Promise.all([
    page.waitForURL((url) => url.hostname === STRIPE_CHECKOUT_HOST, { timeout: 45_000 }),
    click()
  ]);
  await expect(page).toHaveURL(new RegExp(`^https://${STRIPE_CHECKOUT_HOST.replace(".", "\\.")}/`));
}

test.describe("production purchase paths", () => {
  test("the landing-page purchase CTA opens Stripe directly", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const purchasePath = page.locator('[data-revenue-path="home-monthly-primary"]');
    await expect(purchasePath).toHaveCount(1);
    await expectStripeCheckout(page, () =>
      purchasePath.locator('button[type="submit"]').click()
    );
  });

  for (const path of [
    { id: "pricing-single-monthly", tier: "single", interval: "monthly" },
    { id: "pricing-single-yearly", tier: "single", interval: "yearly", useAnnualToggle: true },
    { id: "pricing-standard-monthly", tier: "standard", interval: "monthly" },
    { id: "pricing-standard-yearly", tier: "standard", interval: "yearly", useAnnualToggle: true },
    { id: "pricing-single-monthly-footer", tier: "single", interval: "monthly" },
    { id: "pricing-standard-monthly-footer", tier: "standard", interval: "monthly" }
  ]) {
    test(`${path.id} opens its matching Stripe checkout`, async ({ page }) => {
      await page.context().clearCookies();
      await page.goto("/pricing", { waitUntil: "networkidle" });
      if (path.useAnnualToggle) {
        const annualToggle = page
          .getByRole("group", { name: "Billing interval" })
          .getByRole("button", { name: /Annual/ });
        await annualToggle.click();
        await expect(annualToggle).toHaveAttribute("aria-pressed", "true");
      }
      const purchasePath = page.locator(`[data-revenue-path="${path.id}"]`);
      await expect(purchasePath).toHaveCount(1);
      await expect(purchasePath.locator('input[name="planTier"]')).toHaveValue(path.tier);
      await expect(purchasePath.locator('input[name="interval"]')).toHaveValue(path.interval);
      await expectStripeCheckout(page, () =>
        purchasePath.locator('button[type="submit"]').click()
      );
    });
  }

  test("the subscription funnel purchase CTAs open Single monthly checkout", async ({ page }) => {
    const funnels = [
      {
        path: "/first-grade-homeschool",
        revenuePath: "funnel-first-grade-homeschool-single-monthly"
      },
      {
        path: "/switch-to-paper-based-homeschool",
        revenuePath: "funnel-switch-to-paper-based-homeschool-single-monthly"
      }
    ];

    for (const funnel of funnels) {
      await page.context().clearCookies();
      await page.goto(funnel.path, { waitUntil: "domcontentloaded" });
      const purchasePath = page.locator(`[data-revenue-path="${funnel.revenuePath}"]`).first();
      await expect(purchasePath).toHaveCount(1);
      await expect(purchasePath.locator('input[name="planTier"]')).toHaveValue("single");
      await expect(purchasePath.locator('input[name="interval"]')).toHaveValue("monthly");
      await expectStripeCheckout(page, () =>
        purchasePath.locator('button[type="submit"]').click()
      );
    }
  });

  test("the cold first-grade curriculum landing page opens the one-time checkout", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/first-grade-curriculum", { waitUntil: "networkidle" });

    await page
      .getByRole("button", { name: /Get the complete curriculum/ })
      .first()
      .click();
    const funnelVisitorId = (await page.context().cookies()).find(
      (cookie) => cookie.name === "treeschool_funnel_visitor_id"
    )?.value;
    const bundlePath = page.locator(
      '[data-revenue-path="first-grade-curriculum-bundle-after-bump"]'
    );
    await expect(bundlePath).toHaveCount(1);
    await expect(bundlePath.locator('input[name="funnelKey"]')).toHaveValue(
      "first_grade_curriculum"
    );
    await expect(bundlePath.locator('input[name="returnPath"]')).toHaveValue(
      "/first-grade-curriculum"
    );
    // The managed experiment is authoritative. Its variant can intentionally
    // differ from the legacy middleware fallback cookie while an experiment is
    // running, so verify the variant actually submitted to checkout instead.
    await expect(bundlePath.locator('input[name="landingVariant"]')).toHaveValue(
      /^[ab]$/
    );
    await expect(bundlePath.locator('input[name="funnelVisitorId"]')).toHaveValue(
      funnelVisitorId ?? ""
    );
    await bundlePath
      .getByLabel("Delivery email")
      .fill(`revenue-smoke+curriculum-${Date.now()}@treehomeschool.com`);
    await expectStripeCheckout(page, () =>
      bundlePath.locator('button[type="submit"]').click()
    );
  });

  test("the cold first-grade curriculum landing page opens the membership checkout", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/first-grade-curriculum", { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: /Get the complete curriculum/ })
      .first()
      .click();
    const membershipPath = page.locator(
      '[data-revenue-path="first-grade-curriculum-membership-bump"]'
    );
    await expect(membershipPath).toHaveCount(1);
    await expect(membershipPath.locator('input[name="planTier"]')).toHaveValue("single");
    await expect(membershipPath.locator('input[name="interval"]')).toHaveValue("monthly");
    await expect(membershipPath.locator('input[name="funnelKey"]')).toHaveValue(
      "first_grade_curriculum"
    );
    await expect(membershipPath.locator('input[name="returnPath"]')).toHaveValue(
      "/first-grade-curriculum"
    );
    await expect(
      membershipPath.locator('input[name="landingVariant"]')
    ).toHaveValue(/^[ab]$/);
    await expect(
      membershipPath.locator('input[name="funnelVisitorId"]')
    ).toHaveValue(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    await expectStripeCheckout(page, () =>
      membershipPath.locator('button[type="submit"]').click()
    );
  });

  test("a bookstore product purchase opens Stripe", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/bookstore", { waitUntil: "domcontentloaded" });
    const product = page.locator('article a[aria-label^="View "]').first();
    await expect(product).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/bookstore\/[^/?#]+$/),
      product.click()
    ]);

    const email = page.getByLabel("Where should we send your workbook?");
    await expect(email).toBeVisible();
    await email.fill(`revenue-smoke+product-${Date.now()}@treehomeschool.com`);
    await expectStripeCheckout(page, () =>
      page.getByRole("button", { name: /Buy (and download|standalone PDF|bundle)/ }).click()
    );
  });

  test("the bookstore cart checkout opens Stripe", async ({ page }) => {
    await page.goto("/bookstore", { waitUntil: "domcontentloaded" });
    const addButton = page.getByRole("button", { name: "Add to cart" }).first();
    await expect(addButton).toBeVisible();
    await addButton.click();
    await page.getByRole("button", { name: /Open cart with 1 item/ }).click();
    await page.getByLabel("Delivery email").fill(
      `revenue-smoke+cart-${Date.now()}@treehomeschool.com`
    );
    await expectStripeCheckout(page, () =>
      page.getByRole("button", { name: /Checkout with Stripe/ }).click()
    );
  });
});
