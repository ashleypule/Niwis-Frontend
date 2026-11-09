import { expect, type Page } from '@playwright/test';

/**
 * Scroll the page from top to bottom and back, as a reader would, then wait for the network to settle: panels load
 * their data, charts (ECharts) and maps (Leaflet) only when they near the viewport, so a test that checks every panel
 * of a page has to bring each one into view first.
 */
export async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.round(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 80));
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle');
}

/**
 * Every panel finishes loading: one still loading after the scroll (it re-rendered after the scroll passed it) is
 * brought into view until it loads. A panel that never leaves its skeleton (the Overview's budget panel waited for data
 * the API answers 501 for, audit step 4) fails here.
 */
export async function expectAllLoaded(page: Page) {
  const busy = page.locator('[aria-busy="true"]');
  for (let i = 0; i < 20 && (await busy.count()); i++) {
    await busy
      .first()
      .scrollIntoViewIfNeeded({ timeout: 2_000 })
      .catch(() => undefined); // loaded while scrolling
    await page.waitForTimeout(1_500);
    await page.waitForLoadState('networkidle');
  }
  await expect(busy, 'a panel is still loading').toHaveCount(0, { timeout: 30_000 });
}
