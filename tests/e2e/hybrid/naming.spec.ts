import { expect, test } from '@playwright/test';
import { ROUTES, collectLabels, settle } from '../../../scripts/lib/naming-walk';
import { checkItems } from '../../../src/config/naming';

/**
 * Naming register (docs/NAMING_REGISTER.md): every rendered title, KPI label, axis name, chart series, table header,
 * legend entry, chip, pill and entity field follows the register's names, units, decimals and class labels. Runs on
 * the recorded fixtures (hybrid build); `npm run naming:check -- --base=…` runs the same walk against a live build.
 */
test.describe('naming register', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  for (const route of ROUTES) {
    test(route, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' });
      await settle(page);
      const items = await collectLabels(page, route);
      expect(items.length, 'labels collected').toBeGreaterThan(10);
      const violations = checkItems(items).map((v) => `[${v.kind}] "${v.text}" — ${v.rule}: ${v.detail}`);
      expect(violations).toEqual([]);
    });
  }
});
