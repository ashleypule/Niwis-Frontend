import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** WCAG 2.1 AA checks (axe) on representative pages, in both themes. */
const ROUTES = [
  '/',
  '/drought',
  '/dams',
  '/dams/forecast',
  '/water-quality',
  '/green-drop',
  '/iwrm',
  '/settlements',
  '/ai',
  '/data-integration',
  '/governance',
  '/alerts',
  '/reports',
];

for (const theme of ['light', 'dark'] as const) {
  test.describe(`a11y ${theme}`, () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    for (const route of ROUTES) {
      test(route, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem('niwis-theme', t), theme);
        await page.goto(route, { waitUntil: 'networkidle' });
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
        await page.waitForTimeout(600);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          // ECharts draws to <canvas> (described via aria-label); Leaflet tiles are decorative
          .exclude('.leaflet-tile-pane')
          .analyze();
        const summary = results.violations.map(
          (v) =>
            `${v.id} (${v.impact}): ${v.nodes.length} × ${v.nodes[0]?.target.join(' ')} — ${v.nodes[0]?.failureSummary?.split('\n')[1] ?? ''}`,
        );
        expect(summary).toEqual([]);
      });
    }
  });
}
