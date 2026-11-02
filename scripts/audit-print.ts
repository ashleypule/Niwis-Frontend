/**
 * Audit step 2, part C: the print view (the report cover and each page in print media at A4 width) as full-page
 * captures, to check that no panel is cut. Writes tests/screenshots/audit/print-{report}.png.
 *
 *   npx vite-node scripts/audit-print.ts [--base=http://localhost:4176] [--out=tests/screenshots/audit]
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { settle } from './lib/naming-walk';

const REPORTS = ['drought-bulletin', 'dam-status'];

async function main() {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const base = arg('base') ?? 'http://localhost:4176';
  const outDir = resolve(arg('out') ?? 'tests/screenshots/audit');
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 794, height: 1123 } });
  try {
    for (const report of [...REPORTS, 'pages=/rainfall,/water-quality']) {
      const page = await context.newPage();
      const url = report.startsWith('pages=')
        ? `${base}/reports/print?${report}`
        : `${base}/reports/print?report=${report}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 }).catch(() => undefined);
      await settle(page);
      await page.emulateMedia({ media: 'print' });
      await page.waitForTimeout(1500);
      const name = report.startsWith('pages=') ? 'custom' : report;
      await page.screenshot({ path: resolve(outDir, `print-${name}.png`), fullPage: true });
      await page.pdf({ path: resolve(outDir, `print-${name}.pdf`), format: 'A4', printBackground: true });
      console.log(`print ${name}: captured`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

void main();
