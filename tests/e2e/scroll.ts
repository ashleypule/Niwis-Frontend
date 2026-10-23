import type { Page } from '@playwright/test';

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
