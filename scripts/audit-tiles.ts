/**
 * Audit step 2, part C (review aid): viewport-height tiles of every page, so a reviewer can read a long page at full
 * size (a full-page capture of a 10 000 px page is unreadable when scaled down). Writes
 * <out>/{page}-{width}-{theme}-{n}.png for each tile of `height` px.
 *
 *   npx vite-node scripts/audit-tiles.ts --out=<dir> [--base=http://localhost:4176] [--widths=1440] [--themes=light]
 *                                        [--only=/drought] [--height=1200]
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { ROUTES, settle } from './lib/naming-walk';

const slug = (p: string) => (p === '/' ? 'overview' : p.slice(1).replace(/[/?=&]/g, '_'));

async function main() {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const base = arg('base') ?? 'http://localhost:4176';
  const only = arg('only');
  const widths = (arg('widths') ?? '1440').split(',').map(Number);
  const themes = (arg('themes') ?? 'light').split(',');
  const height = Number(arg('height') ?? 1200);
  const outDir = resolve(arg('out') ?? 'tests/screenshots/audit/tiles');
  mkdirSync(outDir, { recursive: true });
  const routes = only ? ROUTES.filter((r) => r.startsWith(only)) : ROUTES;
  const browser = await chromium.launch();
  try {
    for (const theme of themes)
      for (const width of widths) {
        const context = await browser.newContext({ viewport: { width, height } });
        await context.addInitScript((t) => localStorage.setItem('niwis-theme', t), theme);
        for (const route of routes) {
          const page = await context.newPage();
          await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 120_000 }).catch(() => undefined);
          await settle(page);
          const total = await page.evaluate(() => document.documentElement.scrollHeight);
          let n = 0;
          // viewport captures while scrolling (a clip of a full-page capture re-renders the whole page per tile)
          for (let y = 0; y < total; y += height) {
            await page.evaluate((top) => window.scrollTo(0, top), y);
            await page.waitForTimeout(250);
            await page.screenshot({
              path: resolve(outDir, `${slug(route)}-${width}-${theme}-${String(++n).padStart(2, '0')}.png`),
            });
          }
          console.log(`${route} ${width} ${theme}: ${n} tiles (${total} px)`);
          await page.close();
        }
        await context.close();
      }
  } finally {
    await browser.close();
  }
}

void main();
