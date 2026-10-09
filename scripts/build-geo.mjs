#!/usr/bin/env node
/**
 * Builds the simplified boundary files in public/geo/ from raw downloads.
 *
 * Usage: node scripts/build-geo.mjs <raw-dir>
 *
 * <raw-dir> must contain (see public/geo/SOURCES.md for the download URLs):
 *   zaf_ADM1.geojson, zaf_ADM3.geojson                (geoBoundaries ZAF)
 *   NAM/BWA/ZWE/MOZ/LSO/SWZ_ADM0.geojson              (geoBoundaries ADM0)
 *   wma.geojson, secondary.geojson                    (DWS NWRP map service)
 *   ne_rivers.geojson, ne_places.geojson              (Natural Earth 10m)
 */
import mapshaper from 'mapshaper';
const { runCommands } = mapshaper;
import fs from 'node:fs';
import path from 'node:path';

const raw = process.argv[2];
if (!raw || !fs.existsSync(raw)) {
  console.error('Usage: node scripts/build-geo.mjs <raw-dir>');
  process.exit(1);
}
const out = path.resolve('public/geo');
fs.mkdirSync(out, { recursive: true });
const r = (f) => JSON.stringify(path.join(raw, f));
const o = (f) => JSON.stringify(path.join(out, f));

const PROVINCE_CODES = {
  'Eastern Cape': 'EC',
  'Free State': 'FS',
  Gauteng: 'GP',
  'KwaZulu-Natal': 'KZN',
  Limpopo: 'LP',
  Mpumalanga: 'MP',
  'North West': 'NW',
  'Nothern Cape': 'NC',
  'Northern Cape': 'NC',
  'Western Cape': 'WC',
};

// Normalised province layer, written to a temp file first so other layers can join it.
const tmpProv = path.join(raw, '_provinces_norm.geojson');
{
  const d = JSON.parse(fs.readFileSync(path.join(raw, 'zaf_ADM1.geojson'), 'utf8'));
  d.features = d.features.map((f) => {
    const name = f.properties.shapeName === 'Nothern Cape' ? 'Northern Cape' : f.properties.shapeName;
    return { type: 'Feature', geometry: f.geometry, properties: { id: PROVINCE_CODES[name], name } };
  });
  fs.writeFileSync(tmpProv, JSON.stringify(d));
}
const P = JSON.stringify(tmpProv);

const cmds = [
  // Provinces
  `-i ${P} -simplify 15% keep-shapes -o ${o('provinces.json')} precision=0.0001 format=geojson`,
  // SA mask = dissolved provinces (keeps Lesotho as a hole)
  `-i ${P} -simplify 15% keep-shapes -dissolve -each 'id="ZA",name="South Africa"' -o ${o('south-africa.json')} precision=0.0001 format=geojson`,
  // Local municipalities, tagged with their province by inner point
  `-i ${r('zaf_ADM3.geojson')} -simplify 9% keep-shapes -join ${P} fields=id point-method -rename-fields province=id -each 'id="LM"+String(this.id+1).padStart(3,"0"); name=shapeName' -filter-fields id,name,province -o ${o('municipalities.json')} precision=0.0001 format=geojson`,
  // Water Management Areas (DWS 2012, 9 WMAs)
  `-i ${r('wma.geojson')} -simplify 60% keep-shapes -each 'id="WMA"+WMA_ID; name=WMA_NAME' -filter-fields id,name -o ${o('wmas.json')} precision=0.0001 format=geojson`,
  // Secondary catchments (DWS drainage regions, e.g. A2, C8)
  `-i ${r('secondary.geojson')} -simplify 50% keep-shapes -each 'id=Secondary; name="Secondary catchment "+Secondary; primary=Primary_' -filter 'this.isNull===false' -filter-fields id,name,primary -o ${o('catchments.json')} precision=0.0001 format=geojson`,
  // Neighbouring countries
  `-i ${['NAM', 'BWA', 'ZWE', 'MOZ', 'LSO', 'SWZ'].map((c) => r(`${c}_ADM0.geojson`)).join(' ')} combine-files -merge-layers force -simplify 8% keep-shapes -each 'id=shapeGroup; name=shapeName==="Swaziland"?"Eswatini":shapeName' -filter-fields id,name -o ${o('neighbours.json')} precision=0.001 format=geojson`,
  // Rivers inside the region
  `-i ${r('ne_rivers.geojson')} -clip bbox=15.5,-35.5,33.5,-21.5 -filter 'scalerank<=9' -simplify 30% -each 'name=name||""' -filter-fields name,scalerank -o ${o('rivers.json')} precision=0.001 format=geojson`,
  // Major towns in SA
  `-i ${r('ne_places.geojson')} -filter 'adm0_a3==="ZAF" && (scalerank<=6 || pop_max>=150000)' -each 'pop=pop_max' -filter-fields name,pop -o ${o('towns.json')} precision=0.001 format=geojson`,
];

for (const c of cmds) {
  console.log('mapshaper', c.slice(0, 90), '…');
  await runCommands(c);
}
fs.rmSync(tmpProv);
let total = 0;
for (const f of fs.readdirSync(out).filter((f) => f.endsWith('.json'))) {
  const s = fs.statSync(path.join(out, f)).size;
  total += s;
  console.log(f.padEnd(22), (s / 1024).toFixed(0).padStart(6), 'KB');
}
console.log('TOTAL'.padEnd(22), (total / 1024).toFixed(0).padStart(6), 'KB');
