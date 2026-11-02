/**
 * Naming register (audit step 2, docs/NAMING_REGISTER.md): the canonical display name, unit, decimals, colour scale,
 * good direction and class labels of every variable the UI shows, and the check that every rendered label follows it.
 *
 * - A database column's name and unit are the backend catalogue's (`GET /{module}/categories`), shown as sent; the
 *   register lists them (scripts/naming-register.ts) and this module only checks their units' spelling.
 * - A derived metric's canonical name is its label in metrics.ts; `ALIASES` lists the other spellings the backend and
 *   the pages may use for the same variable; `DEPRECATED` lists the spellings the register retired.
 * - Units are spelled one way (`UNIT_CANON`, `canonUnit`): the catalogue's spelling wins where a column exists
 *   (`mm/year`, `Mm³/year`), the brief's elsewhere (`cfu/100 mL`, `m³/s`, `% FSC`).
 *
 * scripts/naming-check.ts walks the rendered pages and calls `checkItems`; tests/e2e/hybrid/naming.spec.ts runs it.
 */
import { METRICS, type GoodDirection, type MetricDef } from './metrics';
import { SCALES, type ScaleDef } from './palettes';
import { DROUGHT_CLASSES, VEG_CLASSES } from './thresholds';

// ------------------------------------------------------------------ units
/** Other spellings → the register's spelling. Applied wherever the frontend prints a unit it did not get from the catalogue. */
export const UNIT_CANON: Record<string, string> = {
  'Mm³/yr': 'Mm³/year',
  'Mm3/yr': 'Mm³/year',
  'Mm3/year': 'Mm³/year',
  'mm/yr': 'mm/year',
  'm³/yr': 'm³/year',
  'm3/yr': 'm³/year',
  'm3/year': 'm³/year',
  'm3/s': 'm³/s',
  'm3/m3': 'm³/m³',
  'm3/day': 'm³/day',
  'm3/h': 'm³/h',
  Mm3: 'Mm³',
  m3: 'm³',
  km2: 'km²',
  'Ml/day': 'ML/day',
  'Ml/d': 'ML/day',
  'ML/d': 'ML/day',
  Ml: 'ML',
  'kWh/Ml': 'kWh/ML',
  'R/Ml': 'R/ML',
  'R/kl': 'R/kL',
  'R bn': 'R billion',
  'R m': 'R million',
  Rm: 'R million',
  'cfu/100ml': 'cfu/100 mL',
  'cfu/100 ml': 'cfu/100 mL',
  'CFU/100 mL': 'cfu/100 mL',
  'mg/l': 'mg/L',
  'µg/l': 'µg/L',
  'ug/L': 'µg/L',
  'deg C': '°C',
  degC: '°C',
  '°C/dec': '°C/decade',
  'pH units': '',
  'pH unit': '',
  index: '',
  'no unit': '',
  '—': '',
  '-': '',
  '% of income': '%',
  '%FSC': '% FSC',
  '% fsc': '% FSC',
  'breaks/100 km/yr': 'breaks/100 km/year',
  'L/cap/day': 'L/capita/day',
  'l/c/d': 'L/capita/day',
  min: 'min',
  '/decade': 'per decade',
  '/yr': 'per year',
  '/year': 'per year',
  '/month': 'per month',
  'bn m³/yr': 'Mm³/year',
  'million people': 'people',
};

/** Every unit the register allows, as spelled. '' = no unit (indices, ratios, counts whose noun is in the label). */
export const UNITS: readonly string[] = [
  '',
  'mm',
  'mm/day',
  'mm/month',
  'mm/season',
  'mm/year',
  'mm/dekad',
  'mm/h',
  'mm/wet day',
  'mm/decade',
  '°C',
  '°C/decade',
  '°C·days',
  '%',
  '% FSC',
  'pp',
  '%/year',
  'm³/s',
  'Mm³',
  'Mm³/month',
  'Mm³/year',
  'm³',
  'm³/day',
  'm³/month',
  'm³/year',
  'm³/h',
  'm³/m³',
  'm³/ha/season',
  'ML/day',
  'kWh/ML',
  'kWh/day',
  'L/s',
  'L/year',
  'L/capita/day',
  'L/household/month',
  'm',
  'm bgl',
  'm amsl',
  'm/s',
  'm/day',
  'm/year',
  'm/season',
  'm²/day',
  'km',
  'km²',
  'days',
  'days/month',
  'days/decade',
  'district-months',
  'events',
  'events/day',
  'h',
  'h/day',
  'min',
  'mS/m',
  'mg/L',
  'mg/m³',
  'µg/L',
  'cfu/100 mL',
  'eggs/L',
  'cells/mL',
  'NTU',
  'TCU',
  'Hazen',
  'kPa',
  'W/m²',
  't/day',
  'R/kL',
  'R/m³',
  'R/ML',
  'R/year',
  'R million',
  'R billion',
  'breaks/100 km/year',
  'connections/year',
  '°',
  // counts: the unit names what is counted
  'people',
  'households',
  'districts',
  'municipalities',
  'provinces',
  'stations',
  'boreholes',
  'dams',
  'sites',
  'plants',
  'reservoirs',
  'systems',
  'settlements',
  'alerts',
  'tables',
  'columns',
  'rows',
  'records',
  'values',
  'providers',
  'modules',
  'requests',
  'runs',
  'models',
  'datasets',
  'milestones',
  'feeds',
  'per decade',
  'per year',
  'per month',
  '× guideline',
];

/** Catalogue units shown as sent although the register spells them differently (a backend item, step 3). */
export const CATALOGUE_ONLY_UNITS: readonly string[] = ['kWh/Ml', 'R/Ml', 'Ml/day'];

/** The register's spelling of a unit ('' for none). */
export function canonUnit(u: string | null | undefined): string {
  if (!u) return '';
  const t = u.trim();
  if (t in UNIT_CANON) return UNIT_CANON[t];
  // "WWTWs (districts)": the unit is the noun in parentheses
  const inner = /^[^()]+\(([^()]+)\)$/.exec(t)?.[1]?.trim();
  if (inner && (UNITS.includes(inner) || inner in UNIT_CANON)) return canonUnit(inner);
  return t;
}

/** Decimals within the register's range for the unit (a backend hint outside the range is clamped). */
export function clampDecimals(unit: string | undefined, decimals: number | undefined): number | undefined {
  if (decimals == null) return undefined;
  const range = UNIT_DECIMALS[canonUnit(unit)];
  return range ? Math.min(range[1], Math.max(range[0], decimals)) : decimals;
}

/** Decimals a KPI shows: the metric's own (metrics.ts) unless the backend's hint lies inside the unit's range. */
export function registerDecimals(metricId: string, unit: string, decimals: number): number {
  const md = (METRICS as Record<string, MetricDef | undefined>)[metricId];
  const range = UNIT_DECIMALS[canonUnit(unit)];
  if (!md) return clampDecimals(unit, decimals) ?? decimals;
  // a metric's unit is the register's; a KPI in another unit (a count noun) follows the unit rule
  if (canonUnit(md.unit) !== canonUnit(unit)) return clampDecimals(unit, decimals) ?? decimals;
  if (range && (decimals < range[0] || decimals > range[1])) return md.decimals;
  return decimals;
}

/**
 * Decimals of an entity-card field: the metric's when the label names one, else the unit's range applied to the
 * value's magnitude (values under 10 keep two decimals where the unit allows).
 */
export function fieldDecimals(label: string, unit: string | undefined, value: number): number {
  const id = metricOf(label);
  const md = id ? (METRICS as Record<string, MetricDef | undefined>)[id] : undefined;
  if (md && canonUnit(md.unit) === canonUnit(unit)) return md.decimals;
  const guess = Number.isInteger(value) ? 0 : Math.abs(value) < 10 ? 2 : 1;
  return clampDecimals(unit, guess) ?? guess;
}

export const isCanonicalUnit = (u: string) => UNITS.includes(u);

/**
 * Decimals a unit is shown with, by the brief: indices 2, coefficients 2–3, mm 0–1, % 0–1, Mm³ 0, °C 1. A metric's
 * own `decimals` (metrics.ts) is the exact value for KPIs; this is the range tables and tooltips may use.
 */
export const UNIT_DECIMALS: Record<string, [number, number]> = {
  '': [0, 3],
  mm: [0, 1],
  'mm/day': [1, 2],
  'mm/month': [0, 1],
  'mm/season': [0, 1],
  'mm/year': [0, 1],
  'mm/decade': [0, 1],
  '°C': [1, 2],
  '°C/decade': [2, 3],
  '°C·days': [0, 1],
  '%': [0, 1],
  '% FSC': [0, 1],
  pp: [0, 1],
  'm³/s': [0, 2],
  'Mm³': [0, 0],
  'Mm³/month': [0, 0],
  'Mm³/year': [0, 0],
  'ML/day': [0, 0],
  'm³/m³': [2, 3],
  m: [1, 2],
  'm bgl': [1, 1],
  'm amsl': [0, 1],
  'km²': [0, 0],
  days: [0, 1],
  'mS/m': [0, 2],
  'mg/L': [1, 3],
  'µg/L': [1, 2],
  'cfu/100 mL': [0, 0],
  NTU: [1, 2],
  't/day': [0, 1],
  'R/kL': [2, 2],
  'R/m³': [2, 2],
  'R million': [0, 1],
  'R billion': [1, 2],
  kPa: [1, 2],
  'W/m²': [0, 1],
};

// ------------------------------------------------------------------ class labels
/** The register's class labels per palette scale (legends, pills and tables print exactly these). */
export const CLASS_LABELS: Record<string, string[]> = {
  drought: ['No drought', ...DROUGHT_CLASSES.map((c) => `${c.id} ${c.label}`)],
  vci: [...VEG_CLASSES],
  storage: ['Very low', 'Low', 'Moderate', 'High', 'Very high'],
  wqi: ['Excellent', 'Good', 'Fair', 'Poor', 'Very Poor'],
  greenDrop: ['Excellent', 'Good', 'Moderate', 'Poor', 'Critical'],
  blueDrop: ['Excellent', 'Good', 'Moderate', 'Poor', 'Critical'],
  exploitation: ['Very Low', 'Low', 'Moderate', 'High', 'Very High', 'Over-exploited'],
  flowStatus: ['High flow', 'Normal', 'Low flow', 'Data delayed', 'Offline'],
  status: ['Normal', 'Watch', 'Low', 'Warning', 'Critical', 'Under maintenance'],
  risk: ['Low', 'Moderate', 'Medium', 'High', 'Very High', 'Extreme', 'Critical'],
  severity: ['Critical', 'High', 'Moderate', 'Low', 'Info'],
  trendClass: ['Rising', 'Stable', 'Declining'],
  pass: ['Compliant', 'Non-compliant'],
  wq: ['Good', 'Moderate', 'Fair', 'Poor'],
  ecological: [
    'A Natural',
    'B Largely natural',
    'C Moderately modified',
    'D Largely modified',
    'E Seriously modified',
    'F Critically modified',
  ],
  columnStatus: ['Live', 'Withheld', 'Duplicate'],
  feed: ['Online', 'Delayed', 'Degraded', 'Offline'],
  progress: ['Completed', 'On track', 'In progress', 'At risk', 'Delayed', 'Not started', 'Planned'],
  response: ['Intervention', 'In progress', 'Planned', 'Monitoring'],
  stress: ['Low', 'Low–medium', 'Medium', 'High', 'Extremely high'],
  index01: ['Very Low', 'Low', 'Medium', 'High', 'Very High'],
};

/** Class part of a legend / bin label: "−1.6 to −1.3 D2 Severe Drought" → "D2 Severe Drought"; "Excellent (90–100)" → "Excellent". */
export function classOfLabel(label: string): string {
  return label
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/^[<≥>≤]?\s?[-−+\d.,–\s%]+(?:to\s[-−+\d.,%\s]+)?\s+(?=[A-Za-z])/, '')
    .trim();
}

// ------------------------------------------------------------------ metric rows
/** Other spellings of a metric that are the same variable (backend KPI / series / column names). Case-insensitive, whole words. */
export const ALIASES: Partial<Record<keyof typeof METRICS, string[]>> = {
  rainfall: [
    'Total Rainfall',
    'Precipitation',
    'Rain',
    'Catchment rainfall',
    'Monthly rainfall',
    'Daily rainfall',
    'Rainfall total',
  ],
  rainfallAnnual: ['Mean annual precipitation', 'MAP', 'Annual total'],
  rainfallAnomaly: ['Rainfall change', 'Rain anomaly', 'Precipitation anomaly'],
  rainyDays: ['Rainy days', 'Rain days'],
  heavyRainDays: ['R20mm', 'R20', 'Heavy rain days', 'R10mm'],
  maxDailyRain: ['Rx1day', 'Max daily rainfall', 'Maximum 1-day rainfall', 'Max 1-day rainfall', 'Rx5day'],
  cdd: ['CDD', 'Consecutive dry days', 'Dry spell'],
  cwd: ['CWD', 'Consecutive wet days', 'Wet spell'],
  activeStations: ['Active rainfall stations', 'Rainfall stations'],
  spi: [
    'SPI-1',
    'SPI-3',
    'SPI-6',
    'SPI-12',
    'SPI-24',
    'Standardised Precipitation Index',
    'Standardized Precipitation Index',
  ],
  spei: ['SPEI-1', 'SPEI-3', 'SPEI-6', 'SPEI-12', 'SPEI-24', 'Standardised Precipitation-Evapotranspiration Index'],
  droughtClass: ['Drought status', 'Drought classification', 'Drought class'],
  areaInDrought: [
    'Area in drought',
    'Drought area',
    'Area in D1–D4',
    '% of area in D1–D4',
    'Drought-affected area',
    'Drought probability',
  ],
  areaSevere: ['Area in D2–D4', 'Severe drought area'],
  populationAtRisk: ['Population affected', 'Population at risk', 'People affected'],
  settlementsAtRisk: ['Settlements at risk', 'Drought-affected settlements', 'Affected settlements'],
  tmean: ['Tavg', 'Tmean', 'Mean temperature', 'Average temperature', 'Temperature'],
  tmax: ['Tmax', 'Maximum temperature', 'Max temperature'],
  tmin: ['Tmin', 'Minimum temperature', 'Min temperature'],
  tempAnomaly: ['Temperature anomaly', 'Temp anomaly', 'Tavg anomaly', 'Temp change', 'Temperature change'],
  tempTrend: ['Warming trend', 'Temperature trend'],
  hotDays: ['Hot days', 'Heatwave days', 'Heat days', 'Extreme heat days'],
  heatwaveDuration: ['Heatwave duration'],
  frostDays: ['Frost days', 'Cold nights', 'Frost nights'],
  et0: ['ET₀', 'ET0', 'Reference ET₀', 'Reference evapotranspiration', 'Reference ET'],
  pet: [
    'PET',
    'Potential evapotranspiration',
    'Potential evaporation',
    'Evaporation',
    'AET',
    'Actual ET',
    'Actual evapotranspiration',
  ],
  vpd: ['VPD', 'Vapour pressure deficit'],
  cwr: ['Crop water requirement'],
  irrigationDemand: ['Irrigation demand', 'Irrigation water demand'],
  climateRisk: ['Climate risk index', 'Climate risk', 'Vulnerability index', 'Climate vulnerability'],
  ndvi: ['NDVI'],
  evi: ['EVI'],
  savi: ['SAVI'],
  msavi2: ['MSAVI2'],
  vci: ['VCI', 'Vegetation Condition Index', 'Vegetation condition'],
  vhi: ['VHI', 'Vegetation Health Index', 'Vegetation health'],
  tci: ['TCI', 'Temperature Condition Index'],
  vpi: ['VPI'],
  asi: ['ASI', 'Agricultural Stress Index'],
  svi: ['SVI'],
  ndwi: ['NDWI'],
  ndii: ['NDII'],
  lst: ['LST', 'Land surface temperature', 'Land Surface Temp'],
  soilMoisture: ['Soil moisture', 'Surface soil moisture', 'Soil Moisture (Surface)', 'SM'],
  rootZoneSoilMoisture: ['Root-zone soil moisture', 'Root zone soil moisture'],
  soilMoistureAnomaly: ['Soil moisture anomaly'],
  vegStressArea: ['Area under stress', 'Area under vegetation stress', 'Vegetation stress'],
  vegAnomaly: ['Vegetation anomaly', 'NDVI anomaly', 'NDVI change'],
  runoff: [
    'Annual runoff',
    'Runoff depth',
    'Monthly runoff',
    'Mean annual runoff',
    'MAR',
    'Catchment runoff',
    'Runoff (mm)',
  ],
  runoffVolume: ['Runoff volume'],
  runoffAnomaly: ['Runoff anomaly'],
  runoffCoefficient: ['Runoff coefficient'],
  baseflowIndex: ['Baseflow index', 'BFI', 'Baseflow'],
  peakFlow: ['Peak flow', 'Qmax'],
  ssi: [
    'SSI-1',
    'SSI-3',
    'SSI-6',
    'SSI-12',
    'Standardised Streamflow Index',
    'Standardized Streamflow Index',
    'Streamflow index',
  ],
  discharge: [
    'River discharge',
    'Discharge',
    'Flow',
    'Streamflow',
    'River flow',
    'Mean flow',
    'Mean river discharge',
    'Modelled flow',
    'Daily mean flow',
  ],
  stage: ['Water level', 'Stage', 'River water level', 'Stage height'],
  sediment: ['Suspended sediment', 'Sediment concentration', 'SSC'],
  sedimentLoad: ['Sediment load'],
  eflowCompliance: ['Ecological flow compliance', 'E-flow compliance', 'E-flow'],
  floodAlerts: ['Flood alerts'],
  stationsLowFlow: ['Stations with low flow', 'Districts with low flow', 'Low flow'],
  stationsHighFlow: [
    'Stations with high flow',
    'Districts with high flow',
    'High flow',
    'Districts with rising levels',
    'Stations with normal flow',
  ],
  gaugingStations: ['Gauging stations', 'Active gauging stations'],
  storagePct: [
    'Storage',
    'Dam storage',
    'Storage level',
    'Total storage',
    '% FSC',
    'Reservoir storage',
    'Storage (FSC)',
    'Dam Storage (FSC)',
    'Reservoir outlook',
  ],
  storageVolume: ['Storage volume', 'Current volume', 'Volume'],
  capacity: ['Full supply capacity', 'FSC', 'Capacity', 'Design capacity', 'Total design capacity'],
  inflow: ['Inflow', 'Total inflow', 'Influent flow', 'Total influent flow'],
  outflow: ['Outflow', 'Total outflow', 'Releases'],
  evaporationLoss: ['Evaporation loss'],
  damsBelow: [
    'Dams below',
    'Dams below 25%',
    'Dams below threshold',
    'Districts at high risk',
    'At risk',
    'Non-compliant',
    'Sites below REC',
  ],
  damsAbove: ['Dams above', 'Dams above 90%'],
  damAlerts: [
    'Operational alerts',
    'Alerts',
    'Active alerts',
    'Data incidents',
    'Critical',
    'High',
    'Open',
    'Early warnings',
    'AI early warnings',
    'Open programme risks',
  ],
  rsi: ['Reservoir Storage Index', 'RSI'],
  daysToEmpty: ['Days to empty'],
  gwLevel: [
    'Groundwater level',
    'Depth to water',
    'Mean groundwater level',
    'Water level',
    'Depth to groundwater',
    'Depth',
    'Level',
  ],
  gwLevelAnomaly: ['Level anomaly', 'Groundwater level anomaly', 'Groundwater levels'],
  sgi: ['SGI', 'Standardised Groundwater Index', 'Groundwater (SGI)', 'Groundwater index'],
  recharge: [
    'Recharge',
    'Estimated recharge',
    'Direct recharge',
    'Recharge rate',
    'Mean annual recharge',
    'Recharge potential',
  ],
  rechargeVolume: ['Total recharge', 'Recharge volume', 'Groundwater availability'],
  abstraction: ['Abstraction', 'Total abstraction', 'Annual abstraction', 'Groundwater abstraction'],
  exploitationIndex: ['Exploitation index', 'EI'],
  dynamicReserve: ['Dynamic reserve', 'Renewable reserve'],
  staticReserve: ['Static reserve', 'Groundwater in storage'],
  boreholes: [
    'Monitoring boreholes',
    'Boreholes',
    'Districts with aquifer records',
    'Districts with WWTW records',
    'Districts with drinking-water records',
    'Districts with RWQO records',
    'Monitoring stations',
    'Treatment plants',
    'Water treatment plants',
    'Reservoirs',
    'Pump stations',
    'Pipelines',
  ],
  boreholesAtRisk: ['Boreholes at risk', 'High-risk districts', 'High-risk stations'],
  aquifersAtRisk: ['Aquifers at risk', 'Districts at risk'],
  gwsAnomaly: ['GRACE', 'Groundwater storage anomaly'],
  wqi: [
    'WQI',
    'Water Quality Index',
    'Average WQI',
    'CCME WQI',
    'River WQ status',
    'Overall drinking water status',
    'Receiving water impact',
  ],
  wqCompliance: [
    'Compliance rate',
    'SANS 241 compliance',
    'Water quality (compliance)',
    'Microbiological compliance',
    'Dams with good quality',
    'Groundwater quality',
    'Districts in PES A/B',
    'Guideline compliance',
  ],
  stationsExceeding: [
    'Stations exceeding limits',
    'Districts exceeding limits',
    'Districts in poor quality',
    'Exceeding',
  ],
  ph: ['pH'],
  ec: ['EC', 'Electrical conductivity', 'Conductivity'],
  turbidity: ['Turbidity'],
  tds: ['TDS', 'Total dissolved solids'],
  do: ['DO', 'Dissolved oxygen'],
  bod: ['BOD', 'BOD₅', 'BOD5'],
  cod: ['COD'],
  nitrate: ['Nitrate', 'NO₃', 'Nitrogen', 'TIN', 'Total inorganic nitrogen', 'Total nitrogen', 'TN'],
  ammonia: ['Ammonia', 'NH₃', 'NH₄'],
  phosphate: ['Orthophosphate', 'Phosphate', 'PO₄', 'Total phosphorus', 'TP'],
  ecoli: ['E. coli', 'E.coli', 'Faecal coliforms', 'Total coliforms', 'Coliforms', 'Microbiological'],
  chlorophyll: ['Chlorophyll-a', 'Chlorophyll a'],
  freeChlorine: ['Free chlorine', 'Free chlorine residual', 'Chlorine'],
  greenDropScore: ['Green Drop score', 'Green Drop', 'Effluent compliance score', 'Effluent compliance'],
  blueDropScore: ['Blue Drop score', 'Blue Drop', 'SANS 241 compliance score'],
  complianceRate: ['Compliance rate', 'Excellent / Good', 'Compliance', 'Compliance score'],
  sass5: ['SASS5', 'SASS5 score', 'Mean SASS5 score'],
  aspt: ['ASPT', 'Mean ASPT'],
  fibi: ['FIBI', 'Fish index', 'Fish Index of Biotic Integrity', 'Fish community integrity'],
  rwqoCompliance: ['RWQO compliance', 'Objectives met'],
  availability: [
    'Water availability',
    'Utilisable water availability',
    'Total water availability',
    'Surface water availability',
    'Groundwater availability',
    'Utilisable yield',
    'Availability',
  ],
  demand: ['Water demand', 'Total water demand', 'Municipal water demand', 'Demand', 'Sectoral water demand'],
  waterBalance: ['Water balance', 'Supply–demand balance', 'National water balance', 'Balance'],
  ecologicalReserve: ['Ecological reserve', 'Ecological reserve requirement', 'Reserve'],
  recycled: ['Recycled', 'Return flow', 'Return flows', 'Recycled & return flows', 'Recycled and return flows'],
  stressIndex: ['Water stress index', 'Water stress', 'Water security index', 'Stress'],
  transfers: ['Inter-basin transfers', 'Transfers', 'Inter-Basin Transfers'],
  allocationUse: ['Allocation utilisation', 'Licensed allocation utilised', 'Allocation'],
  populationServed: ['Population served', 'Households served', 'Households'],
  pipedAccess: [
    'Piped water access',
    'Piped water',
    'Water services access',
    'Coverage',
    'Basic (RDP) access',
    'Service coverage',
  ],
  sanitationAccess: ['Sanitation access', 'Sanitation'],
  nrw: ['NRW', 'Non-revenue water', 'System water losses', 'Water losses'],
  reliability: [
    'Supply reliability',
    'System reliability',
    'Service reliability',
    'Water supply reliability',
    'Reliability',
  ],
  interruptions: ['Interruptions', 'Service interruptions', 'Unplanned interruptions'],
  pipeFailureRate: ['Pipe failure rate', 'Pipe failures', 'Bursts'],
  tariff: [
    'Tariff',
    'Average domestic tariff',
    'Municipal tariff',
    'Average municipal tariff',
    'Bulk water tariff',
    'Average bulk water tariff',
    'Water tariff',
    'Domestic tariff',
    'Block tariff',
  ],
  rawWaterTariff: ['Raw water tariff', 'Raw water charge', 'Average raw water charge', 'Raw water pricing'],
  revenue: ['Revenue', 'Raw water revenue', 'Bulk water revenue', 'Municipal water revenue', 'Total revenue'],
  affordability: [
    'Affordability',
    'Water bill share',
    'Household affordability',
    'Water bill as % of household income',
  ],
  costRecovery: ['Cost recovery', 'Cost recovery ratio'],
  droughtExposure: ['Drought exposure index', 'Drought exposure', 'Exposure'],
  altSupplyCoverage: ['Alternative supply coverage', 'Alternative supply'],
  dataQuality: ['Data quality score', 'Data quality', 'Datasets with metadata', 'Standards compliance', 'Completeness'],
  feedLatency: ['Feed latency', 'Average feed latency', 'Average data latency', 'Data latency', 'Latency'],
  recordsIngested: [
    'Records ingested',
    'Records',
    'Data providers',
    'Active data feeds',
    'Data domains',
    'Total datasets',
    'Access requests',
    'Modules raising alerts',
    'Provinces affected',
    'Values judged',
    'Samples analysed',
    'Feeds',
    'Forecast runs',
    'Data feeds live',
  ],
  interventions: ['Active interventions', 'Interventions'],
  programmeProgress: [
    'Programme progress',
    'Overall progress',
    'IWRM sustainability status',
    'Progress',
    'Current phase',
    'Sub-phases completed',
  ],
  budgetSpent: ['Budget spent', 'Budget'],
  modelSkill: ['Model skill', 'NSE', 'Skill', 'Mean model skill', 'Operational AI models', 'AI models', 'Models'],
};

/**
 * Retired spellings the frontend rewrites on derived labels (KPI labels, series and axis names, table headers,
 * category names) — never on a database column's catalogue label. `canonLabel` applies them.
 */
export const RENAMES: { re: RegExp; to: string }[] = [
  { re: /\b(SPI|SPEI|SSI|SGI)[ -]?(\d+)[ -]?months?\b/gi, to: '$1-$2' },
  { re: /\b(SPI|SPEI|SSI|SGI) (\d+)\b/g, to: '$1-$2' },
  { re: /%FSC\b/g, to: '% FSC' },
  { re: /\bR20 ?mm days\b/gi, to: 'Heavy rain days (R20mm)' },
  { re: /\bStandardized\b/g, to: 'Standardised' },
  { re: /\bMm3\b/g, to: 'Mm³' },
  { re: /\bm3\b/g, to: 'm³' },
  { re: /\bkm2\b/g, to: 'km²' },
  { re: /\bMl\/day\b/g, to: 'ML/day' },
  { re: /\b(Mm³|mm|m³)\/yr\b/g, to: '$1/year' },
  { re: /\bdeg ?C\b/g, to: '°C' },
  { re: /\bE\.coli\b/g, to: 'E. coli' },
  { re: /\s*\((—|-|no unit)\)/g, to: '' },
];

/** A derived label in the register's spelling (catalogue labels are never passed through this). */
export function canonLabel(text: string): string {
  let t = text;
  for (const r of RENAMES) t = t.replace(r.re, r.to);
  return t.replace(/\s{2,}/g, ' ').trim();
}

/** Spellings the register retired: the renames above, plus wording only a page or the backend can change. */
export const DEPRECATED: { re: RegExp; use: string }[] = [
  { re: /\b(?:SPI|SPEI|SSI|SGI)[ -]?\d+[ -]?months?\b/i, use: 'SPI-n' },
  { re: /\b(?:SPI|SPEI|SSI|SGI) \d+\b/, use: 'SPI-n' },
  { re: /%FSC\b/, use: '% FSC' },
  { re: /\bR20 ?mm days\b/i, use: 'Heavy rain days (R20mm)' },
  { re: /\bStandardized\b/, use: 'Standardised' },
  { re: /\bMm3\b|\bm3\b|\bkm2\b/, use: 'Mm³ / m³ / km²' },
  { re: /\bMl\/day\b/, use: 'ML/day' },
  { re: /\b(?:Mm³|mm|m³)\/yr\b/, use: '…/year' },
  { re: /\bdeg ?C\b/, use: '°C' },
  { re: /\bE\.coli\b/, use: 'E. coli' },
  { re: /1981\s*[–-]\s*2010|1961\s*[–-]\s*1990/, use: 'the baseline from the response (e.g. 2000–2026 mean)' },
  { re: /\bSPI-?3 ≤ −1\.5\b/, use: 'area in D2–D4' },
  { re: /\(—\)|\(no unit\)/, use: 'index (a unitless axis)' },
];

/**
 * Words of the mock-up era that name things the database does not hold: on a live panel the data are per district
 * municipality, so a title naming stations, gauges, boreholes, works, systems or sites misdescribes it.
 */
export const MOCKUP_WORDS =
  /\b(gauging stations?|stations?|gauges?|boreholes?|WWTWs?|water supply systems?|monitoring sites?|sites?|aquifer units?)\b/i;

export interface RegisterRow {
  id: string;
  name: string;
  unit: string;
  decimals: number;
  good: GoodDirection;
  scale?: string;
  classes?: string[];
  aliases: string[];
  section: string;
  source: string;
  description?: string;
}

/** The derived-metric rows of the register (metrics.ts, with the register's unit spelling and aliases). */
export function metricRows(): RegisterRow[] {
  return (Object.entries(METRICS) as [keyof typeof METRICS, MetricDef][]).map(([id, m]) => ({
    id,
    name: m.label,
    unit: canonUnit(m.unit),
    decimals: m.decimals,
    good: m.goodDirection,
    scale: m.scale,
    classes: m.scale ? CLASS_LABELS[m.scale] : undefined,
    aliases: ALIASES[id] ?? [],
    section: m.section,
    source: m.source,
    description: m.description,
  }));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface Pattern {
  id: string;
  re: RegExp;
}

let patterns: Pattern[] | undefined;
function metricPatterns(): Pattern[] {
  if (patterns) return patterns;
  patterns = [];
  for (const r of metricRows()) {
    for (const name of [r.name, ...r.aliases]) {
      const body = esc(name)
        .replace(/\\\(.*?\\\)/g, '')
        .replace(/\s+/g, '\\s*')
        .replace(/-/g, '[-‑–]?');
      if (!body.trim()) continue;
      patterns.push({ id: r.id, re: new RegExp(`(?<![A-Za-z0-9₀-₉])${body}(?![A-Za-z0-9₀-₉])`, 'i') });
    }
  }
  // longest names first: "Rainfall anomaly" before "Rainfall"
  patterns.sort((a, b) => b.re.source.length - a.re.source.length);
  return patterns;
}

/** The register metric a label names, if any. */
export function metricOf(text: string): string | undefined {
  const t = text.replace(/\s*\([^)]*\)/g, (m) => (/[A-Za-z]{3,}/.test(m) ? m : ''));
  return metricPatterns().find((p) => p.re.test(t))?.id;
}

/** The unit a label carries in parentheses, e.g. "Rainfall (mm)" → "mm"; undefined when it has none. */
export function unitInLabel(text: string): string | undefined {
  const m = /\(([^()]*)\)\s*$/.exec(text.trim());
  if (!m) return undefined;
  const u = m[1].trim();
  // a description in parentheses ("% of area in D1–D4", "% change", "Selected District") is not a unit
  if (/\s(of|change|in|per)\s|^%\s+\w/.test(u) && !UNITS.includes(canonUnit(u))) return undefined;
  return UNITS.includes(canonUnit(u)) || CATALOGUE_ONLY_UNITS.includes(u) || /^[%°]/.test(u) || u in UNIT_CANON
    ? u
    : undefined;
}

/** Number of decimals a rendered number shows ("1 464", "0.433", "−0.83 %"). */
export function decimalsShown(text: string): number | undefined {
  const m = /[-−+]?\d[\d  ]*(?:\.(\d+))?/.exec(text);
  if (!m) return undefined;
  return m[1]?.length ?? 0;
}

/** "9 43" (a decimal comma turned into a space) or five digits without a thousands separator. */
export function badNumberFormat(text: string): string | undefined {
  if (/(?<![\d.])\d{1,3}[  ]\d{1,2}(?![\d  ])/.test(text) && !/\d{1,3}[  ]\d{3}/.test(text))
    return 'digits separated by a single space ("9 43")';
  if (/(?<![\d.,-])\d{5,}(?![\d-])/.test(text)) return 'no thousands separator';
  return undefined;
}

export interface LabelItem {
  route: string;
  kind: string;
  text: string;
  [k: string]: unknown;
}

export interface Violation {
  route: string;
  kind: string;
  text: string;
  rule: string;
  detail: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/**
 * Check the labels of one or more rendered pages against the register. Rules:
 * - `unit`: a unit the register does not spell this way (titles, KPIs, axes, headers, fields, chips);
 * - `deprecated`: a retired spelling or an old baseline in a title / label;
 * - `mockup`: a live panel's title naming stations / gauges / boreholes / works where the data are per district;
 * - `decimals`: a KPI value, table column or entity field with other decimals than the register;
 * - `register`: a KPI, series, legend title, table number column or field naming no register variable;
 * - `class`: a pill or legend entry whose class label is not the register's;
 * - `format`: a number not in SA style (space thousands, decimal point);
 * - `axis`: a value axis without a unit (or 'index');
 * - `good`: a delta coloured against the metric's good direction;
 * - `marker`: a stale marker that names a month for an annual value, or a "Data to" without a date.
 */
export function checkItems(items: LabelItem[]): Violation[] {
  const out: Violation[] = [];
  const add = (it: LabelItem, rule: string, detail: string) =>
    out.push({ route: it.route, kind: it.kind, text: it.text, rule, detail });
  for (const it of items) {
    const text = it.text ?? '';
    const isCatalogue = it.kind === 'chip' || it.kind === 'table-block' || (it.kind === 'title' && it.cat === true);
    // units in parentheses, in the register's spelling
    if (
      ['title', 'kpi', 'axis', 'header', 'field', 'chip', 'series', 'legend-title', 'tab', 'layer', 'context'].includes(
        it.kind,
      )
    ) {
      const u = unitInLabel(text);
      if (u != null) {
        const cu = canonUnit(u);
        if (!UNITS.includes(cu)) add(it, 'unit', `"${u}" is not a register unit`);
        else if (cu !== u && !(isCatalogue && CATALOGUE_ONLY_UNITS.includes(u)))
          add(it, 'unit', `"${u}" should be "${cu}"`);
      }
    }
    // retired spellings (never applied to the catalogue's own labels, nor to the backend's prose notes)
    const catalogueSeries = it.kind === 'series' && it.cat === true;
    if (
      !isCatalogue &&
      !catalogueSeries &&
      ['title', 'kpi', 'series', 'axis', 'header', 'tab', 'layer', 'legend-title', 'stage', 'field'].includes(it.kind)
    ) {
      for (const d of DEPRECATED) if (d.re.test(text)) add(it, 'deprecated', `use ${d.use}`);
    }
    // a live panel's title naming the mock-up's stations / gauges / boreholes / works over district data
    if (
      it.kind === 'title' &&
      !isCatalogue &&
      it.prov === 'live' &&
      MOCKUP_WORDS.test(text) &&
      !/\bdistricts?\b/i.test(text)
    )
      add(it, 'mockup', 'names stations / gauges / boreholes / works / sites; the live data are per district');
    if (it.kind === 'kpi' && !it.forecast) {
      const metric = str(it.metric) ?? '';
      const row = (METRICS as Record<string, MetricDef | undefined>)[metric];
      const unit = canonUnit(str(it.unit));
      if (!UNITS.includes(unit)) add(it, 'unit', `KPI unit "${str(it.unit)}" is not a register unit`);
      if (!row) add(it, 'register', `metric "${metric}" is not in the register`);
      else if (!metricOf(text))
        add(it, 'register', `label names no register variable (metric ${metric}: ${row.label})`);
      const value = str(it.value) ?? '';
      if (/\d/.test(value) && !/^[—–-]$/.test(value)) {
        const shown = decimalsShown(value);
        const want = row ? Number(it.decimals ?? row.decimals) : undefined;
        if (shown != null && want != null && shown !== want && !/^0$/.test(value))
          add(it, 'decimals', `shows ${shown} decimals, the register says ${want} (${unit || 'no unit'})`);
        const bad = badNumberFormat(value);
        if (bad) add(it, 'format', bad);
      }
      const pill = str(it.pill);
      const scale = str(it.pillScale);
      if (pill && scale && CLASS_LABELS[scale] && !CLASS_LABELS[scale].includes(pill))
        add(it, 'class', `pill "${pill}" is not a ${scale} class label (${CLASS_LABELS[scale].join(' / ')})`);
      for (const m of (it.markers as string[] | undefined) ?? []) {
        if (/^stale:Data to\s*$/.test(m)) add(it, 'marker', 'stale marker without a date');
      }
    }
    if (it.kind === 'axis') {
      const name = text.trim();
      if (!name) {
        if (it.axisType !== 'category') add(it, 'axis', 'value axis without a unit');
      } else if (name !== 'index' && !/\(unit per parameter\)$/.test(name)) {
        const inParens = unitInLabel(name);
        const u = inParens ?? name;
        const cu = canonUnit(u);
        if (inParens == null && UNITS.includes(cu) && cu !== '') {
          if (cu !== u) add(it, 'unit', `axis "${name}" should say "${cu}"`);
        } else if (inParens == null) {
          // a bare label: fine when it names a unitless register variable ("SPI-3", "Drought exposure index")
          const id = metricOf(name);
          const md = id ? (METRICS as Record<string, MetricDef | undefined>)[id] : undefined;
          if (!md || canonUnit(md.unit) !== '')
            add(it, 'axis', `axis "${name}" has no unit (and names no unitless register variable)`);
        } else if (!UNITS.includes(cu) && !CATALOGUE_ONLY_UNITS.includes(u))
          add(it, 'unit', `axis "${name}" has no register unit`);
        else if (cu !== u && !CATALOGUE_ONLY_UNITS.includes(u)) add(it, 'unit', `axis "${name}" should say "${cu}"`);
      }
    }
    if (it.kind === 'header' && it.type === 'number') {
      const u = str(it.unit);
      if (u != null && u !== '') {
        const cu = canonUnit(u);
        if (!UNITS.includes(cu)) add(it, 'unit', `column unit "${u}" is not a register unit`);
        else if (cu !== u) add(it, 'unit', `column unit "${u}" should be "${cu}"`);
        const d = it.decimals != null && it.decimals !== '' ? Number(it.decimals) : undefined;
        const range = UNIT_DECIMALS[cu];
        if (d != null && range && (d < range[0] || d > range[1]))
          add(it, 'decimals', `column decimals ${d} outside the register's ${range[0]}–${range[1]} for ${cu}`);
      }
    }
    if (it.kind === 'series' && it.seriesType !== 'pie') {
      const axis = str(it.axis) ?? '';
      const u = unitInLabel(text);
      if (u != null && axis && canonUnit(u) !== canonUnit(unitInLabel(axis) ?? axis))
        add(it, 'unit', `series unit "${u}" differs from its axis "${axis}"`);
    }
    if (it.kind === 'legend-title') {
      if (!text.trim()) add(it, 'register', 'map legend without a title');
      const u = canonUnit(str(it.unit));
      if (str(it.unit) && !UNITS.includes(u))
        add(it, 'unit', `map layer unit "${str(it.unit)}" is not a register unit`);
    }
    if (it.kind === 'legend' && it.scale) {
      const scale = str(it.scale) ?? '';
      const sc = (SCALES as Record<string, ScaleDef | undefined>)[scale];
      const labels = CLASS_LABELS[scale];
      if (sc?.kind === 'category' && labels && text !== 'No data' && !labels.includes(classOfLabel(text)))
        add(it, 'class', `legend entry "${text}" is not a ${scale} class label`);
    }
    if (it.kind === 'pill') {
      const scale = str(it.scale) ?? '';
      const labels = CLASS_LABELS[scale];
      if (labels && text && text !== '—' && !labels.includes(text) && !labels.includes(classOfLabel(text)))
        add(it, 'class', `pill "${text}" is not a ${scale} class label`);
    }
    if (it.kind === 'field') {
      const u = str(it.unit);
      if (u) {
        const cu = canonUnit(u);
        if (!UNITS.includes(cu)) add(it, 'unit', `field unit "${u}" is not a register unit`);
        else if (cu !== u) add(it, 'unit', `field unit "${u}" should be "${cu}"`);
      }
      const value = str(it.value) ?? '';
      const bad = badNumberFormat(value);
      if (bad) add(it, 'format', bad);
    }
    if (['item', 'kpi', 'field', 'stage'].includes(it.kind)) {
      const v = str(it.value) ?? (it.kind === 'stage' ? '' : '');
      const bad = v ? badNumberFormat(v) : undefined;
      if (bad && it.kind !== 'kpi' && it.kind !== 'field') add(it, 'format', bad);
    }
    if (it.kind === 'marker' && it.marker === 'stale' && /^Data to\s*$/.test(text))
      add(it, 'marker', 'stale marker without a date');
  }
  return out;
}
