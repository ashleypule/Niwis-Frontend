/**
 * Metric registry: every metric shown in the UI. Drives KPI formatting, delta colouring (goodDirection),
 * legends and docs/DATA_DICTIONARY.md. `section` refers to the Data Requirements Specification.
 */
import type { ScaleId } from './palettes';

export type GoodDirection = 'up' | 'down' | 'neutral';

export interface MetricDef {
  label: string;
  unit: string;
  decimals: number;
  goodDirection: GoodDirection;
  scale?: ScaleId;
  source: string;
  section: string;
  description?: string;
}

const m = (
  label: string,
  unit: string,
  decimals: number,
  goodDirection: GoodDirection,
  source: string,
  section: string,
  scale?: ScaleId,
  description?: string,
): MetricDef => ({ label, unit, decimals, goodDirection, source, section, scale, description });

export const METRICS = {
  // ---- Meteorology / rainfall (§3.1, §6)
  rainfall: m('Rainfall', 'mm', 0, 'up', 'SAWS', '§6.1', 'rainfall'),
  rainfallAnnual: m('Annual rainfall', 'mm', 0, 'up', 'SAWS', '§4.3', 'rainfall'),
  rainfallMonthly: m('Monthly rainfall', 'mm', 0, 'up', 'SAWS', '§6.1', 'rainfallMonthly'),
  rainfallAnomaly: m(
    'Rainfall anomaly',
    '%',
    0,
    'up',
    'SAWS / derived',
    '§6.1',
    'anomalyPct',
    'Deviation from the 1981–2010 normal',
  ),
  rainyDays: m('Rainy days (≥ 1 mm)', 'days', 0, 'up', 'SAWS', '§6.1'),
  heavyRainDays: m('Heavy rain days (R20mm)', 'days', 0, 'neutral', 'SAWS', '§4.2'),
  maxDailyRain: m('Max daily rainfall (Rx1day)', 'mm', 0, 'neutral', 'SAWS', '§4.2'),
  cdd: m('Consecutive dry days (CDD)', 'days', 0, 'down', 'SAWS / derived', '§4.2', 'days'),
  cwd: m('Consecutive wet days (CWD)', 'days', 0, 'up', 'SAWS / derived', '§4.2'),
  activeStations: m('Active rainfall stations', '', 0, 'up', 'SAWS', '§6.1'),
  spi: m(
    'SPI',
    '',
    2,
    'up',
    'SAWS / DWS (derived)',
    '§3.1, §6.2',
    'spi',
    'Standardised Precipitation Index (McKee 1993)',
  ),
  spei: m(
    'SPEI',
    '',
    2,
    'up',
    'SAWS / DWS (derived)',
    '§3.1, §6.2',
    'spi',
    'Standardised Precipitation-Evapotranspiration Index',
  ),
  droughtClass: m('Drought class', '', 0, 'neutral', 'DWS (derived from SPI)', '§3.4', 'drought'),
  areaInDrought: m('Area in drought (D1–D4)', '%', 0, 'down', 'Derived', '§3.4'),
  areaSevere: m('Area in severe drought (D2–D4)', '%', 0, 'down', 'Derived', '§3.4'),
  populationAtRisk: m('Population at risk', 'people', 0, 'down', 'Stats SA / derived', '§20.2'),
  settlementsAtRisk: m('Settlements at risk', '', 0, 'down', 'Derived', '§20'),
  // ---- Temperature / climate (§4)
  tmean: m('Mean temperature', '°C', 1, 'neutral', 'SAWS', '§4.1', 'temperature'),
  tmax: m('Max temperature', '°C', 1, 'neutral', 'SAWS', '§4.1', 'temperature'),
  tmin: m('Min temperature', '°C', 1, 'neutral', 'SAWS', '§4.1', 'temperature'),
  tempAnomaly: m('Temperature anomaly', '°C', 1, 'down', 'SAWS / CSIR', '§4.1', 'tempAnomaly', 'vs 1981–2010 baseline'),
  tempTrend: m('Temperature trend', '°C/decade', 2, 'down', 'SAWS / derived', '§4.1', 'tempTrend'),
  hotDays: m('Hot days (Tmax > 35 °C)', 'days', 0, 'down', 'SAWS / derived', '§4.1', 'days'),
  heatwaveDuration: m('Heatwave duration', 'days', 0, 'down', 'SAWS / derived', '§4.1'),
  frostDays: m('Frost days (Tmin < 0 °C)', 'days', 0, 'neutral', 'SAWS', '§4.1'),
  et0: m('Reference ET (ET₀)', 'mm', 0, 'down', 'SAWS', '§4.4'),
  pet: m('Potential evapotranspiration', 'mm', 0, 'down', 'SAWS / derived', '§4.4'),
  vpd: m('Vapour pressure deficit', 'kPa', 2, 'down', 'SAWS', '§4.4'),
  cwr: m('Crop water requirement', 'mm', 0, 'down', 'SAWS + NDA', '§4.5'),
  irrigationDemand: m('Irrigation water demand', 'mm', 0, 'down', 'DWS / NDA', '§4.5'),
  climateRisk: m('Climate risk index', '', 2, 'down', 'CSIR / derived', '§4', 'index01'),
  seaLevel: m('Sea level anomaly', 'mm', 0, 'down', 'SANHO / derived', '§4'),
  // ---- Vegetation (§5)
  ndvi: m('NDVI', '', 2, 'up', 'SANSA / MODIS', '§5.1', 'ndvi'),
  evi: m('EVI', '', 2, 'up', 'SANSA / MODIS', '§5.1', 'ndvi'),
  savi: m('SAVI', '', 2, 'up', 'SANSA / Landsat', '§5.1', 'ndvi'),
  msavi2: m('MSAVI2', '', 2, 'up', 'SANSA / Landsat', '§5.1', 'ndvi'),
  vci: m('VCI', '%', 0, 'up', 'SANSA / derived', '§5.1', 'vci'),
  vhi: m('VHI', '%', 0, 'up', 'SANSA / derived', '§5.1', 'vci'),
  tci: m('TCI', '%', 0, 'up', 'SANSA / derived', '§5.1', 'vci'),
  vpi: m('VPI', '%', 0, 'up', 'SANSA / derived', '§5.1', 'vci'),
  asi: m('Agricultural Stress Index', '%', 0, 'down', 'FAO / SANSA', '§5.1'),
  svi: m('SVI', '', 2, 'up', 'SANSA / derived', '§5.1', 'spi'),
  ndwi: m('NDWI', '', 2, 'up', 'SANSA', '§5.1', 'ndvi'),
  ndii: m('NDII', '', 2, 'up', 'SANSA', '§5.1', 'ndvi'),
  lst: m('Land surface temperature', '°C', 1, 'down', 'SANSA / MODIS', '§5.1', 'lst'),
  soilMoisture: m('Surface soil moisture', 'm³/m³', 2, 'up', 'SANSA / Sentinel-1', '§3.2', 'soilMoisture'),
  rootZoneSoilMoisture: m('Root-zone soil moisture', 'm³/m³', 2, 'up', 'SANSA / SMOS', '§3.2', 'soilMoisture'),
  soilMoistureAnomaly: m('Soil moisture anomaly', '%', 0, 'up', 'SANSA / derived', '§3.2', 'anomalyPct'),
  vegStressArea: m('Area under vegetation stress', '%', 0, 'down', 'SANSA / derived', '§5.3'),
  vegAnomaly: m('Vegetation anomaly', '%', 0, 'up', 'SANSA / derived', '§5.3', 'anomalyPct'),
  // ---- Runoff / surface water (§7, §9)
  runoff: m('Runoff', 'mm', 0, 'up', 'DWS', '§7.1', 'runoff'),
  runoffVolume: m('Runoff volume', 'Mm³', 0, 'up', 'DWS', '§7.1'),
  runoffAnomaly: m('Runoff anomaly', '%', 0, 'up', 'DWS / derived', '§7.2', 'anomalyPct'),
  runoffCoefficient: m('Runoff coefficient', '', 2, 'neutral', 'DWS / derived', '§7.1', 'runoffCoeff'),
  baseflowIndex: m('Baseflow index (BFI)', '', 2, 'up', 'DWS / derived', '§9.1'),
  peakFlow: m('Peak flow (Qmax)', 'm³/s', 0, 'neutral', 'DWS', '§9.1'),
  ssi: m('SSI', '', 2, 'up', 'DWS / derived', '§3.3', 'spi', 'Standardised Streamflow Index'),
  discharge: m('River discharge', 'm³/s', 1, 'up', 'DWS telemetry', '§9.1', 'flow'),
  stage: m('Water level (stage)', 'm', 2, 'neutral', 'DWS telemetry', '§9.1'),
  sediment: m('Suspended sediment', 'mg/L', 0, 'down', 'DWS', '§9.1'),
  sedimentLoad: m('Sediment load', 't/day', 0, 'down', 'DWS / derived', '§9.1'),
  eflowCompliance: m('Ecological flow compliance', '%', 0, 'up', 'DWS', '§15.3'),
  floodAlerts: m('Flood alerts', '', 0, 'down', 'DWS', '§9'),
  stationsLowFlow: m('Stations with low flow', '%', 0, 'down', 'DWS', '§9'),
  stationsHighFlow: m('Stations with high flow', '%', 0, 'neutral', 'DWS', '§9'),
  gaugingStations: m('Active gauging stations', '', 0, 'up', 'DWS', '§9'),
  // ---- Dams (§8)
  storagePct: m('Storage', '% FSC', 1, 'up', 'DWS Hydstra', '§8.1', 'storage'),
  storageVolume: m('Storage volume', 'Mm³', 0, 'up', 'DWS Hydstra', '§8.1'),
  capacity: m('Full supply capacity', 'Mm³', 0, 'neutral', 'DWS', '§8.1'),
  inflow: m('Inflow', 'Mm³', 0, 'up', 'DWS gauging', '§8.1'),
  outflow: m('Outflow (releases + spills)', 'Mm³', 0, 'neutral', 'DWS telemetry', '§8.1'),
  evaporationLoss: m('Evaporation loss', 'Mm³', 0, 'down', 'SAWS / derived', '§8.1'),
  damsBelow: m('Dams below threshold', '', 0, 'down', 'DWS', '§8.2'),
  damsAbove: m('Dams above 90% FSC', '', 0, 'up', 'DWS', '§8.2'),
  damAlerts: m('Operational alerts', '', 0, 'down', 'DWS', '§8.2'),
  rsi: m('Reservoir Storage Index', '', 2, 'up', 'DWS / derived', '§8.2', 'spi'),
  daysToEmpty: m('Days to empty', 'days', 0, 'up', 'Derived', '§8.2'),
  // ---- Groundwater (§10, §11)
  gwLevel: m('Groundwater level', 'm bgl', 1, 'down', 'DWS NGA', '§10.1', 'gwDepth'),
  gwLevelAnomaly: m(
    'Groundwater level anomaly',
    'm',
    1,
    'up',
    'DWS NGA / derived',
    '§10.1',
    undefined,
    'Positive = shallower (higher) than normal',
  ),
  sgi: m('SGI', '', 2, 'up', 'DWS / derived', '§10.1', 'spi', 'Standardised Groundwater Index'),
  recharge: m('Recharge', 'mm/yr', 0, 'up', 'DWS / modelled', '§10.1'),
  rechargeVolume: m('Recharge', 'Mm³/yr', 0, 'up', 'DWS / modelled', '§11.2'),
  abstraction: m('Abstraction', 'Mm³/yr', 0, 'down', 'DWS / WUA', '§11.3'),
  exploitationIndex: m('Exploitation index', '', 2, 'down', 'DWS / derived', '§11.3', 'exploitation'),
  dynamicReserve: m('Dynamic reserve', 'Mm³/yr', 0, 'up', 'DWS / modelled', '§11.1'),
  staticReserve: m('Static reserve', 'Mm³', 0, 'up', 'DWS / CGS', '§11.1'),
  boreholes: m('Monitoring boreholes', '', 0, 'up', 'DWS NGA', '§10'),
  boreholesAtRisk: m('Boreholes at risk', '', 0, 'down', 'DWS NGA', '§10'),
  aquifersAtRisk: m('Aquifers at risk', '', 0, 'down', 'DWS', '§11'),
  gwsAnomaly: m('GRACE groundwater storage anomaly', 'cm', 1, 'up', 'GRACE-FO / SANSA', '§10.3'),
  // ---- Water quality (§12–15)
  wqi: m('Water Quality Index', '', 0, 'up', 'DWS NWQMS', '§12', 'wqi'),
  wqCompliance: m('SANS 241 compliance', '%', 0, 'up', 'DWS / labs', '§14.1'),
  stationsExceeding: m('Stations exceeding limits', '%', 0, 'down', 'DWS', '§12'),
  ph: m('pH', 'pH units', 1, 'neutral', 'DWS', '§12.2'),
  ec: m('Electrical conductivity', 'mS/m', 0, 'down', 'DWS', '§12.1'),
  turbidity: m('Turbidity', 'NTU', 1, 'down', 'DWS', '§12.1'),
  tds: m('Total dissolved solids', 'mg/L', 0, 'down', 'DWS', '§12.1'),
  do: m('Dissolved oxygen', 'mg/L', 1, 'up', 'DWS', '§12.2'),
  bod: m('BOD₅', 'mg/L', 1, 'down', 'DWS labs', '§12.2'),
  cod: m('COD', 'mg/L', 0, 'down', 'DWS labs', '§12.2'),
  nitrate: m('Nitrate (NO₃⁻-N)', 'mg/L', 2, 'down', 'DWS labs', '§12.2'),
  ammonia: m('Ammonia (NH₃-N)', 'mg/L', 2, 'down', 'DWS labs', '§12.2'),
  phosphate: m('Orthophosphate (PO₄³⁻)', 'mg/L', 3, 'down', 'DWS labs', '§12.2'),
  ecoli: m('E. coli', 'cfu/100 mL', 0, 'down', 'DWS / municipal labs', '§12.3'),
  chlorophyll: m('Chlorophyll-a', 'µg/L', 1, 'down', 'DWS / SANSA', '§12.3'),
  freeChlorine: m('Free chlorine residual', 'mg/L', 2, 'neutral', 'WTP', '§14.1'),
  greenDropScore: m('Green Drop score', '%', 0, 'up', 'DWS Green Drop', '§13', 'greenDrop'),
  blueDropScore: m('Blue Drop score', '%', 0, 'up', 'DWS Blue Drop', '§14', 'blueDrop'),
  complianceRate: m('Compliance rate', '%', 0, 'up', 'DWS', '§13–14'),
  sass5: m('SASS5 score', '', 0, 'up', 'DWS / WRC', '§15.1'),
  aspt: m('ASPT', '', 1, 'up', 'DWS', '§15.1'),
  fibi: m('Fish Index of Biotic Integrity', '%', 0, 'up', 'SANBI / DWS', '§15.1'),
  rwqoCompliance: m('RWQO compliance', '%', 0, 'up', 'DWS', '§15'),
  // ---- WRM / quantity (§16, §17)
  availability: m('Water availability', 'Mm³/yr', 0, 'up', 'DWS', '§16.1'),
  demand: m('Water demand', 'Mm³/yr', 0, 'down', 'DWS', '§16.1'),
  waterBalance: m('Water balance (surplus)', 'Mm³/yr', 0, 'up', 'DWS', '§17.2'),
  ecologicalReserve: m('Ecological reserve', 'Mm³/yr', 0, 'neutral', 'DWS', '§16.1'),
  recycled: m('Recycled / return flow', 'Mm³/yr', 0, 'up', 'DWS', '§16.1'),
  stressIndex: m('Water stress index', '', 2, 'down', 'DWS / derived', '§16.1', 'stress'),
  transfers: m('Inter-basin transfers', 'Mm³/yr', 0, 'neutral', 'DWS / TCTA', '§17.1'),
  allocationUse: m('Allocation utilisation', '%', 0, 'neutral', 'DWS', '§17'),
  // ---- Services (§18)
  populationServed: m('Population served', 'people', 0, 'up', 'Stats SA / DWS', '§18.1'),
  pipedAccess: m('Piped water access', '%', 0, 'up', 'Stats SA / DWS', '§18.1', 'coverage'),
  sanitationAccess: m('Sanitation access (RDP)', '%', 0, 'up', 'Stats SA / DWS', '§18.1', 'coverage'),
  nrw: m('Non-revenue water', '%', 0, 'down', 'Municipalities', '§18.2', 'nrw'),
  reliability: m('Supply reliability', '%', 0, 'up', 'Municipalities', '§18.4'),
  interruptions: m('Unplanned interruptions', 'events', 0, 'down', 'Municipal call centres', '§18.2'),
  pipeFailureRate: m('Pipe failure rate', 'breaks/100 km/yr', 1, 'down', 'Municipalities', '§18.2'),
  // ---- Tariffs (§19)
  tariff: m('Average domestic tariff', 'R/kL', 2, 'neutral', 'Municipalities', '§19.2', 'tariff'),
  rawWaterTariff: m('Raw water tariff', 'R/m³', 2, 'neutral', 'DWS tariff schedule', '§19.1'),
  revenue: m('Revenue', 'R million', 0, 'up', 'DWS / WSAs', '§19'),
  affordability: m('Water bill share of household income', '%', 1, 'down', 'Stats SA / derived', '§19.2'),
  costRecovery: m('Cost recovery', '%', 0, 'up', 'Municipalities', '§19.2'),
  // ---- Settlements (§20)
  droughtExposure: m('Drought exposure index', '', 2, 'down', 'Derived', '§20', 'index01'),
  altSupplyCoverage: m('Alternative supply coverage', '%', 0, 'up', 'DWS / municipalities', '§20'),
  // ---- Platform (§21–24)
  dataQuality: m('Data quality score', '%', 0, 'up', 'NIWIS QC engine', '§23.1'),
  feedLatency: m('Average feed latency', 'min', 0, 'down', 'NIWIS', '§21'),
  recordsIngested: m('Records ingested (24 h)', 'records', 0, 'up', 'NIWIS', '§21'),
  programmeProgress: m('Programme progress', '%', 0, 'up', 'DWS PMO', '§24'),
  budgetSpent: m('Budget spent', 'R million', 0, 'neutral', 'DWS PMO', '§24.4'),
  modelSkill: m('Model skill (NSE)', '', 2, 'up', 'NIWIS AI', '§22'),
} satisfies Record<string, MetricDef>;

export type MetricId = keyof typeof METRICS;

export function metric(id: string): MetricDef {
  return (METRICS as Record<string, MetricDef>)[id] ?? m(id, '', 1, 'neutral', '—', '—');
}
