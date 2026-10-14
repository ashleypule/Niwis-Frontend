// Dev helper: node scripts/probe.mjs <url> [out.png] [waitMs] [width] — lists /api responses and console errors
import { chromium } from '@playwright/test';
const [, , url, out, wait = '8000', width = '1440'] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
const log = [];
page.on(
  'console',
  (m) => ['error', 'warning'].includes(m.type()) && log.push(`[${m.type()}] ${m.text().slice(0, 300)}`),
);
page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
page.on('response', (r) => {
  const u = new URL(r.url());
  if (u.pathname.startsWith('/api/'))
    log.push(`[${r.status()}${r.fromServiceWorker() ? ' sw' : ''}] ${u.pathname}${u.search}`);
});
await page.goto(url, { waitUntil: 'load', timeout: 90000 }).catch((e) => log.push(String(e)));
await page.waitForTimeout(Number(wait));
if (out) await page.screenshot({ path: out, fullPage: true });
console.log(log.join('\n'));
await browser.close();
