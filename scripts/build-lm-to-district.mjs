// Builds src/mocks/reference/lm-to-district.json: each of the 213 local municipalities (public/geo/municipalities.json,
// ids LM001…) → its district / metro (public/geo/districts.json, MDB codes), by point-in-polygon of the LM's centroid.
// The two boundary sets come from different geoBoundaries releases, so every LM is also checked by area overlap; LMs
// whose centroid falls outside the LM itself, or whose overlap with the chosen district is < 90 %, are listed as
// border cases for a manual check (see `checked` below and public/geo/SOURCES.md).
//   node scripts/build-lm-to-district.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as turf from '@turf/turf';

const ROOT = resolve(import.meta.dirname, '..');
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const lms = read('public/geo/municipalities.json').features;
const districts = read('public/geo/districts.json').features;

/**
 * Border cases checked by hand against the MDB municipal list (2026-10-14): LM id → district.
 * LM012 Breede Valley: C-shaped, centroid outside the LM; 99 % of its area is in Cape Winelands (DC2). Correct.
 * LM156 Overstrand: 98 % in Overberg (DC3); the 0.1 % in Cape Town is a boundary-release mismatch. Correct.
 */
const checked = { LM012: 'DC2', LM156: 'DC3' };

const area = (f) => turf.area(f);
const overlap = (a, b) => {
  try {
    const i = turf.intersect(turf.featureCollection([a, b]));
    return i ? area(i) : 0;
  } catch {
    return 0;
  }
};

const map = {};
const border = [];
for (const lm of lms) {
  const id = lm.properties.id;
  let pt = turf.centroid(lm);
  const centroidInside = turf.booleanPointInPolygon(pt, lm);
  if (!centroidInside) pt = turf.pointOnFeature(lm); // C-shaped LMs: use a point guaranteed inside
  const byPoint = districts.find((d) => turf.booleanPointInPolygon(pt, d));
  // area check against districts whose bbox touches the LM
  const [x0, y0, x1, y1] = turf.bbox(lm);
  const near = districts.filter((d) => {
    const [a0, b0, a1, b1] = turf.bbox(d);
    return a0 <= x1 && a1 >= x0 && b0 <= y1 && b1 >= y0;
  });
  const lmArea = area(lm);
  const shares = near.map((d) => ({ d, share: overlap(lm, d) / lmArea })).sort((a, b) => b.share - a.share);
  const best = shares[0];
  const chosen = checked[id] ?? byPoint?.properties.id ?? best?.d.properties.id;
  map[id] = chosen;
  const chosenShare = shares.find((s) => s.d.properties.id === chosen)?.share ?? 0;
  if (!centroidInside || !byPoint || chosenShare < 0.9 || byPoint.properties.id !== best?.d.properties.id)
    border.push({
      id,
      name: lm.properties.name,
      district: chosen,
      centroidInside,
      overlap: Math.round(chosenShare * 1000) / 10,
      runnerUp: shares[1] ? `${shares[1].d.properties.id} ${Math.round(shares[1].share * 1000) / 10}%` : null,
      checked: id in checked,
    });
}

const out = {
  source: 'scripts/build-lm-to-district.mjs — centroid of public/geo/municipalities.json in public/geo/districts.json',
  districts: districts
    .map((d) => ({
      id: d.properties.id,
      name: d.properties.name,
      province: d.properties.province,
      kind: d.properties.kind,
    }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  lmToDistrict: map,
  borderCases: border,
};
writeFileSync(resolve(ROOT, 'src/mocks/reference/lm-to-district.json'), `${JSON.stringify(out, null, 1)}\n`);
const unassigned = Object.entries(map).filter(([, v]) => !v);
console.log(
  `${Object.keys(map).length} LMs → ${new Set(Object.values(map)).size} districts; ${border.length} border cases; ${unassigned.length} unassigned`,
);
for (const b of border) console.log(' ', JSON.stringify(b));
