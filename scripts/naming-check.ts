/**
 * Naming check (audit step 2): walks every rendered page and reports each title, context line, KPI label, axis name,
 * legend entry (chart series), table header, map / scale legend entry, chip, tab, map layer, pill, entity field and
 * cascade stage that is not in the naming register (docs/NAMING_REGISTER.md, built from src/config/naming.ts), or that
 * shows a unit, decimals or class label the register does not allow.
 *
 *   npx vite-node scripts/naming-check.ts [--base=http://localhost:4174] [--out=report.json] [--only=/drought]
 *   npx vite-node scripts/naming-check.ts --from=report.json      (re-check the labels saved by an earlier walk)
 *
 * The Playwright hybrid project runs the same walk as a test (tests/e2e/hybrid/naming.spec.ts) against the recorded
 * fixtures; for the audit it was run against the live backend (`vite preview --mode live`, port 4176).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { checkItems, type LabelItem } from '../src/config/naming';
import { ROUTES, walk } from './lib/naming-walk';

async function main() {
  const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const base = arg('base') ?? 'http://localhost:4174';
  const only = arg('only');
  const routes = only ? ROUTES.filter((r) => r.startsWith(only)) : ROUTES;
  const from = arg('from');
  const items = from
    ? (JSON.parse(readFileSync(from, 'utf8')) as { items: LabelItem[] }).items
    : await walk(base, routes, (r, its) => console.log(`${r}: ${its.length} labels`));
  const violations = checkItems(items);
  const out = arg('out');
  if (out) writeFileSync(out, JSON.stringify({ base, items, violations }, null, 1));
  const byKind = new Map<string, number>();
  for (const v of violations) byKind.set(v.rule, (byKind.get(v.rule) ?? 0) + 1);
  console.log(`\n${items.length} labels on ${routes.length} pages; ${violations.length} violations`);
  for (const [k, n] of byKind) console.log(`  ${k}: ${n}`);
  for (const v of violations.slice(0, 400)) console.log(`${v.route}  [${v.kind}] "${v.text}" — ${v.rule}: ${v.detail}`);
  if (violations.length) process.exitCode = 1;
}

void main();
