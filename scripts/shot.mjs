// Dev helper: node scripts/shot.mjs <path> <width> <out.png> [waitMs] [light|dark]
import { chromium } from '@playwright/test';
const [, , path = '/', width = '1440', out = 'shot.png', wait = '6000', theme] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 });
if (theme) await page.addInitScript((t) => localStorage.setItem('niwis-theme', t), theme);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.url()}`); });
await page.goto(`http://localhost:5173${path}`, { waitUntil: 'networkidle', timeout: 90000 }).catch((e) => errors.push(String(e)));
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out, fullPage: true });
console.log(errors.slice(0, 30).join('\n') || 'no console errors');
await browser.close();
