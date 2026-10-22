/**
 * Every legend / colour scale used in NIWIS. Defined once and reused by maps, legends, pills and charts.
 * Scales are chosen to be colour-blind safe (ColorBrewer / USDM derived; sequential scales vary in lightness,
 * diverging scales pivot on a light neutral). Where meaning is carried by colour, UI also shows a label/icon.
 */

export interface ScaleBin {
  /** class id (categorical scales) */
  id?: string;
  label: string;
  color: string;
  /** inclusive lower bound */
  min?: number;
  /** exclusive upper bound */
  max?: number;
  /** text colour on top of `color` (computed if omitted) */
  ink?: string;
}

export interface ScaleDef {
  id: string;
  title: string;
  unit?: string;
  /** 'threshold' = numeric bins, 'category' = match on id */
  kind: 'threshold' | 'category';
  bins: ScaleBin[];
  /** colour for null / no data */
  noData?: string;
}

const NO_DATA = '#C9D3DE';

const s = (id: string, title: string, unit: string | undefined, bins: ScaleBin[]): ScaleDef => ({
  id,
  title,
  unit,
  kind: 'threshold',
  bins,
  noData: NO_DATA,
});
const c = (id: string, title: string, bins: ScaleBin[]): ScaleDef => ({
  id,
  title,
  kind: 'category',
  bins,
  noData: NO_DATA,
});

/** Base semantic colours (also mirrored as CSS variables in index.css). */
export const COLORS = {
  primary: '#1565C0',
  navy: '#0B1F3A',
  green: '#2E7D32',
  good: '#1B7F3B',
  warn: '#E69500',
  bad: '#C62828',
  neutral: '#64748B',
  series: ['#1565C0', '#E95F35', '#2E9E5B', '#8E44AD', '#F2A900', '#0FA3B1', '#6D4C41', '#D81B60', '#546E7A'],
} as const;

export const SCALES = {
  // US Drought Monitor convention, spec §3.4
  drought: c('drought', 'Drought classification (D0–D4)', [
    { id: 'None', label: 'No drought', color: '#DCEFD8' },
    { id: 'D0', label: 'D0 – Abnormally dry', color: '#FFF06A' },
    { id: 'D1', label: 'D1 – Moderate drought', color: '#FCD37F' },
    { id: 'D2', label: 'D2 – Severe drought', color: '#FFAA00' },
    { id: 'D3', label: 'D3 – Extreme drought', color: '#E60000', ink: '#fff' },
    { id: 'D4', label: 'D4 – Exceptional drought', color: '#730000', ink: '#fff' },
  ]),
  spi: s('spi', 'SPI / SPEI', undefined, [
    { label: '≤ −2.0 Exceptional drought', color: '#730000', max: -1.995, ink: '#fff' },
    { label: '−2.0 to −1.6 Extreme', color: '#E60000', min: -1.995, max: -1.595, ink: '#fff' },
    { label: '−1.6 to −1.3 Severe', color: '#FFAA00', min: -1.595, max: -1.295 },
    { label: '−1.3 to −0.8 Moderate', color: '#FCD37F', min: -1.295, max: -0.795 },
    { label: '−0.8 to −0.5 Abnormally dry', color: '#FFF06A', min: -0.795, max: -0.495 },
    { label: '−0.5 to 1.0 Near normal', color: '#B8E0A8', min: -0.495, max: 1.0 },
    { label: '1.0 to 1.5 Moderately wet', color: '#74B4E0', min: 1.0, max: 1.5 },
    { label: '1.5 to 2.0 Very wet', color: '#2F7BC1', min: 1.5, max: 2.0, ink: '#fff' },
    { label: '≥ 2.0 Extremely wet', color: '#123F8C', min: 2.0, ink: '#fff' },
  ]),
  storage: s('storage', 'Storage level (% FSC)', '%', [
    { id: 'very-low', label: '< 25% Very low', color: '#D7301F', max: 25, ink: '#fff' },
    { id: 'low', label: '25–50% Low', color: '#F28C28', min: 25, max: 50 },
    { id: 'moderate', label: '50–70% Moderate', color: '#F6CF3E', min: 50, max: 70 },
    { id: 'high', label: '70–90% High', color: '#4CAF50', min: 70, max: 90 },
    { id: 'very-high', label: '≥ 90% Very high', color: '#1F6FD1', min: 90, ink: '#fff' },
  ]),
  wqi: s('wqi', 'Water Quality Index', undefined, [
    { id: 'Very Poor', label: 'Very poor (0–25)', color: '#D7301F', max: 25, ink: '#fff' },
    { id: 'Poor', label: 'Poor (25–50)', color: '#F28C28', min: 25, max: 50 },
    { id: 'Fair', label: 'Fair (50–70)', color: '#F6CF3E', min: 50, max: 70 },
    { id: 'Good', label: 'Good (70–90)', color: '#4CAF50', min: 70, max: 90 },
    { id: 'Excellent', label: 'Excellent (90–100)', color: '#1F6FD1', min: 90, ink: '#fff' },
  ]),
  greenDrop: s('greenDrop', 'Green Drop score (%)', '%', [
    { id: 'Critical', label: 'Critical (< 30%)', color: '#D7301F', max: 30, ink: '#fff' },
    { id: 'Poor', label: 'Poor (30–49%)', color: '#F28C28', min: 30, max: 50 },
    { id: 'Moderate', label: 'Moderate (50–69%)', color: '#F6CF3E', min: 50, max: 70 },
    { id: 'Good', label: 'Good (70–89%)', color: '#8BC34A', min: 70, max: 90 },
    { id: 'Excellent', label: 'Excellent (≥ 90%)', color: '#1B7F3B', min: 90, ink: '#fff' },
  ]),
  blueDrop: s('blueDrop', 'Blue Drop score (%)', '%', [
    { id: 'Critical', label: 'Critical (< 50%)', color: '#D7301F', max: 50, ink: '#fff' },
    { id: 'Poor', label: 'Poor (50–69%)', color: '#F28C28', min: 50, max: 70 },
    { id: 'Moderate', label: 'Moderate (70–89%)', color: '#F6CF3E', min: 70, max: 90 },
    { id: 'Good', label: 'Good (90–94%)', color: '#8BC34A', min: 90, max: 95 },
    { id: 'Excellent', label: 'Excellent (≥ 95%)', color: '#1F6FD1', min: 95, ink: '#fff' },
  ]),
  ndvi: s('ndvi', 'NDVI', undefined, [
    { label: '< 0.1 Bare / no vegetation', color: '#8C510A', max: 0.1, ink: '#fff' },
    { label: '0.1–0.2 Very low', color: '#BF812D', min: 0.1, max: 0.2 },
    { label: '0.2–0.3 Low', color: '#DFC27D', min: 0.2, max: 0.3 },
    { label: '0.3–0.4 Moderate', color: '#F6E8C3', min: 0.3, max: 0.4 },
    { label: '0.4–0.5 Moderate–high', color: '#C7E9A0', min: 0.4, max: 0.5 },
    { label: '0.5–0.6 High', color: '#7FC97F', min: 0.5, max: 0.6 },
    { label: '0.6–0.7 Very high', color: '#35978F', min: 0.6, max: 0.7, ink: '#fff' },
    { label: '≥ 0.7 Dense', color: '#01665E', min: 0.7, ink: '#fff' },
  ]),
  vci: s('vci', 'Condition index (%)', '%', [
    // class names: spec §5.3 (vegetation health classification); thresholds.ts vegClass()
    { id: 'Very Poor', label: '0–20 Very Poor', color: '#A50026', max: 20, ink: '#fff' },
    { id: 'Poor', label: '20–40 Poor', color: '#F46D43', min: 20, max: 40 },
    { id: 'Fair', label: '40–60 Fair', color: '#FEE08B', min: 40, max: 60 },
    { id: 'Good', label: '60–80 Good', color: '#A6D96A', min: 60, max: 80 },
    { id: 'Excellent', label: '80–100 Excellent', color: '#1A9850', min: 80, ink: '#fff' },
  ]),
  ndviAnomaly: s('ndviAnomaly', 'NDVI anomaly', undefined, [
    { label: '< −0.3 Much lower', color: '#A50026', max: -0.3, ink: '#fff' },
    { label: '−0.3 to −0.1', color: '#F46D43', min: -0.3, max: -0.1 },
    { label: '−0.1 to +0.1 Normal', color: '#FFFFBF', min: -0.1, max: 0.1 },
    { label: '+0.1 to +0.3', color: '#A6D96A', min: 0.1, max: 0.3 },
    { label: '> +0.3 Much higher', color: '#1A9850', min: 0.3, ink: '#fff' },
  ]),
  ndviTrend: s('ndviTrend', 'NDVI trend (per decade)', '/decade', [
    { label: '< −0.1 Browning', color: '#8C510A', max: -0.1, ink: '#fff' },
    { label: '−0.1 to −0.05', color: '#D8B365', min: -0.1, max: -0.05 },
    { label: '−0.05 to +0.05', color: '#F5F5F5', min: -0.05, max: 0.05 },
    { label: '+0.05 to +0.1', color: '#5AB4AC', min: 0.05, max: 0.1 },
    { label: '> +0.1 Greening', color: '#01665E', min: 0.1, ink: '#fff' },
  ]),
  temperature: s('temperature', 'Mean temperature (°C)', '°C', [
    { label: '< 8', color: '#313695', max: 8, ink: '#fff' },
    { label: '8–12', color: '#4575B4', min: 8, max: 12, ink: '#fff' },
    { label: '12–16', color: '#91BFDB', min: 12, max: 16 },
    { label: '16–20', color: '#FEE090', min: 16, max: 20 },
    { label: '20–24', color: '#FC8D59', min: 20, max: 24 },
    { label: '24–28', color: '#D73027', min: 24, max: 28, ink: '#fff' },
    { label: '> 28', color: '#A50026', min: 28, ink: '#fff' },
  ]),
  tempAnomaly: s('tempAnomaly', 'Temperature anomaly (°C)', '°C', [
    { label: '< −1.0', color: '#2166AC', max: -1, ink: '#fff' },
    { label: '−1.0 to −0.5', color: '#67A9CF', min: -1, max: -0.5 },
    { label: '−0.5 to 0', color: '#D1E5F0', min: -0.5, max: 0 },
    { label: '0 to 0.5', color: '#FDDBC7', min: 0, max: 0.5 },
    { label: '0.5 to 1.0', color: '#F4A582', min: 0.5, max: 1.0 },
    { label: '1.0 to 1.5', color: '#D6604D', min: 1.0, max: 1.5, ink: '#fff' },
    { label: '1.5 to 2.0', color: '#B2182B', min: 1.5, max: 2.0, ink: '#fff' },
    { label: '> 2.0', color: '#67001F', min: 2.0, ink: '#fff' },
  ]),
  tempTrend: s('tempTrend', 'Temperature trend (°C/decade)', '°C/decade', [
    { label: '< 0', color: '#4575B4', max: 0, ink: '#fff' },
    { label: '0–0.1', color: '#FFFFB2', min: 0, max: 0.1 },
    { label: '0.1–0.2', color: '#FED976', min: 0.1, max: 0.2 },
    { label: '0.2–0.3', color: '#FD8D3C', min: 0.2, max: 0.3 },
    { label: '0.3–0.4', color: '#E31A1C', min: 0.3, max: 0.4, ink: '#fff' },
    { label: '> 0.4', color: '#800026', min: 0.4, ink: '#fff' },
  ]),
  rainfall: s('rainfall', 'Rainfall (mm)', 'mm', [
    { label: '< 50', color: '#FFFFD9', max: 50 },
    { label: '50–100', color: '#EDF8B1', min: 50, max: 100 },
    { label: '100–200', color: '#C7E9B4', min: 100, max: 200 },
    { label: '200–400', color: '#7FCDBB', min: 200, max: 400 },
    { label: '400–600', color: '#41B6C4', min: 400, max: 600 },
    { label: '600–800', color: '#1D91C0', min: 600, max: 800, ink: '#fff' },
    { label: '800–1 200', color: '#225EA8', min: 800, max: 1200, ink: '#fff' },
    { label: '> 1 200', color: '#0C2C84', min: 1200, ink: '#fff' },
  ]),
  rainfallMonthly: s('rainfallMonthly', 'Monthly rainfall (mm)', 'mm', [
    { label: '< 5', color: '#FFFFD9', max: 5 },
    { label: '5–15', color: '#EDF8B1', min: 5, max: 15 },
    { label: '15–30', color: '#C7E9B4', min: 15, max: 30 },
    { label: '30–60', color: '#7FCDBB', min: 30, max: 60 },
    { label: '60–100', color: '#41B6C4', min: 60, max: 100 },
    { label: '100–150', color: '#1D91C0', min: 100, max: 150, ink: '#fff' },
    { label: '> 150', color: '#225EA8', min: 150, ink: '#fff' },
  ]),
  anomalyPct: s('anomalyPct', 'Anomaly (% of normal)', '%', [
    { label: '< −50', color: '#8C510A', max: -50, ink: '#fff' },
    { label: '−50 to −25', color: '#D8B365', min: -50, max: -25 },
    { label: '−25 to −10', color: '#F6E8C3', min: -25, max: -10 },
    { label: '−10 to +10', color: '#F5F5F5', min: -10, max: 10 },
    { label: '+10 to +25', color: '#C7EAE5', min: 10, max: 25 },
    { label: '+25 to +50', color: '#5AB4AC', min: 25, max: 50 },
    { label: '> +50', color: '#01665E', min: 50, ink: '#fff' },
  ]),
  runoff: s('runoff', 'Runoff (mm)', 'mm', [
    { label: '< 10', color: '#FFF7EC', max: 10 },
    { label: '10–50', color: '#ECE7F2', min: 10, max: 50 },
    { label: '50–100', color: '#D0D1E6', min: 50, max: 100 },
    { label: '100–200', color: '#A6BDDB', min: 100, max: 200 },
    { label: '200–400', color: '#74A9CF', min: 200, max: 400 },
    { label: '400–600', color: '#3690C0', min: 400, max: 600, ink: '#fff' },
    { label: '600–800', color: '#0570B0', min: 600, max: 800, ink: '#fff' },
    { label: '> 800', color: '#034E7B', min: 800, ink: '#fff' },
  ]),
  runoffCoeff: s('runoffCoeff', 'Runoff coefficient', undefined, [
    { label: '< 0.02', color: '#FFF7EC', max: 0.02 },
    { label: '0.02–0.05', color: '#D0D1E6', min: 0.02, max: 0.05 },
    { label: '0.05–0.1', color: '#A6BDDB', min: 0.05, max: 0.1 },
    { label: '0.1–0.2', color: '#74A9CF', min: 0.1, max: 0.2 },
    { label: '0.2–0.3', color: '#2B8CBE', min: 0.2, max: 0.3, ink: '#fff' },
    { label: '> 0.3', color: '#045A8D', min: 0.3, ink: '#fff' },
  ]),
  flow: s('flow', 'River flow (m³/s)', 'm³/s', [
    { label: '< 1 Critical', color: '#B2182B', max: 1, ink: '#fff' },
    { label: '1–10 Very low', color: '#EF8A62', min: 1, max: 10 },
    { label: '10–50 Low', color: '#FDDBC7', min: 10, max: 50 },
    { label: '50–100 Moderate', color: '#D1E5F0', min: 50, max: 100 },
    { label: '100–500 High', color: '#67A9CF', min: 100, max: 500 },
    { label: '> 500 Very high', color: '#2166AC', min: 500, ink: '#fff' },
  ]),
  flowStatus: c('flowStatus', 'Gauging station status', [
    { id: 'High Flow', label: 'High flow', color: '#2166AC', ink: '#fff' },
    { id: 'Normal', label: 'Normal', color: '#4CAF50' },
    { id: 'Low Flow', label: 'Low flow', color: '#F6CF3E' },
    { id: 'Data Delayed', label: 'Data delayed', color: '#F28C28' },
    { id: 'Offline', label: 'Offline', color: '#7B8794', ink: '#fff' },
  ]),
  gwDepth: s('gwDepth', 'Groundwater level (m bgl)', 'm bgl', [
    { label: '< 5', color: '#08519C', max: 5, ink: '#fff' },
    { label: '5–10', color: '#3182BD', min: 5, max: 10, ink: '#fff' },
    { label: '10–20', color: '#6BAED6', min: 10, max: 20 },
    { label: '20–30', color: '#C6DBEF', min: 20, max: 30 },
    { label: '30–50', color: '#FDD0A2', min: 30, max: 50 },
    { label: '50–100', color: '#FD8D3C', min: 50, max: 100 },
    { label: '> 100', color: '#A63603', min: 100, ink: '#fff' },
  ]),
  exploitation: s('exploitation', 'Exploitation index (abstraction / recharge)', undefined, [
    { id: 'Very Low', label: '< 0.1 Very low', color: '#1F6FD1', max: 0.1, ink: '#fff' },
    { id: 'Low', label: '0.1–0.3 Low', color: '#74B4E0', min: 0.1, max: 0.3 },
    { id: 'Moderate', label: '0.3–0.5 Moderate', color: '#B8E0A8', min: 0.3, max: 0.5 },
    { id: 'High', label: '0.5–0.7 High', color: '#F6CF3E', min: 0.5, max: 0.7 },
    { id: 'Very High', label: '0.7–1.0 Very high', color: '#F28C28', min: 0.7, max: 1.0 },
    { id: 'Over-exploited', label: '> 1.0 Over-exploited', color: '#B2182B', min: 1.0, ink: '#fff' },
  ]),
  soilMoisture: s('soilMoisture', 'Soil moisture (m³/m³)', 'm³/m³', [
    { label: '< 0.05', color: '#8C510A', max: 0.05, ink: '#fff' },
    { label: '0.05–0.10', color: '#D8B365', min: 0.05, max: 0.1 },
    { label: '0.10–0.15', color: '#F6E8C3', min: 0.1, max: 0.15 },
    { label: '0.15–0.20', color: '#C7EAE5', min: 0.15, max: 0.2 },
    { label: '0.20–0.30', color: '#5AB4AC', min: 0.2, max: 0.3 },
    { label: '> 0.30', color: '#01665E', min: 0.3, ink: '#fff' },
  ]),
  lst: s('lst', 'Land surface temperature (°C)', '°C', [
    { label: '< 15', color: '#4575B4', max: 15, ink: '#fff' },
    { label: '15–20', color: '#91BFDB', min: 15, max: 20 },
    { label: '20–25', color: '#E0F3F8', min: 20, max: 25 },
    { label: '25–30', color: '#FEE090', min: 25, max: 30 },
    { label: '30–35', color: '#FC8D59', min: 30, max: 35 },
    { label: '> 35', color: '#D73027', min: 35, ink: '#fff' },
  ]),
  days: s('days', 'Days', 'days', [
    { label: '< 7', color: '#FFFFCC', max: 7 },
    { label: '7–15', color: '#FFEDA0', min: 7, max: 15 },
    { label: '15–30', color: '#FED976', min: 15, max: 30 },
    { label: '30–45', color: '#FD8D3C', min: 30, max: 45 },
    { label: '45–60', color: '#E31A1C', min: 45, max: 60, ink: '#fff' },
    { label: '> 60', color: '#800026', min: 60, ink: '#fff' },
  ]),
  percent: s('percent', 'Percentage', '%', [
    { label: '< 20%', color: '#F1EEF6', max: 20 },
    { label: '20–40%', color: '#BDC9E1', min: 20, max: 40 },
    { label: '40–60%', color: '#74A9CF', min: 40, max: 60 },
    { label: '60–80%', color: '#2B8CBE', min: 60, max: 80, ink: '#fff' },
    { label: '≥ 80%', color: '#045A8D', min: 80, ink: '#fff' },
  ]),
  coverage: s('coverage', 'Service coverage (%)', '%', [
    { label: '< 60%', color: '#D7301F', max: 60, ink: '#fff' },
    { label: '60–75%', color: '#F28C28', min: 60, max: 75 },
    { label: '75–85%', color: '#F6CF3E', min: 75, max: 85 },
    { label: '85–95%', color: '#8BC34A', min: 85, max: 95 },
    { label: '≥ 95%', color: '#1B7F3B', min: 95, ink: '#fff' },
  ]),
  nrw: s('nrw', 'Non-revenue water (%)', '%', [
    { label: '< 15%', color: '#1B7F3B', max: 15, ink: '#fff' },
    { label: '15–25%', color: '#8BC34A', min: 15, max: 25 },
    { label: '25–35%', color: '#F6CF3E', min: 25, max: 35 },
    { label: '35–45%', color: '#F28C28', min: 35, max: 45 },
    { label: '≥ 45%', color: '#D7301F', min: 45, ink: '#fff' },
  ]),
  tariff: s('tariff', 'Average domestic tariff (R/kL)', 'R/kL', [
    { label: '< R15', color: '#EFF3FF', max: 15 },
    { label: 'R15–25', color: '#BDD7E7', min: 15, max: 25 },
    { label: 'R25–35', color: '#6BAED6', min: 25, max: 35 },
    { label: 'R35–45', color: '#3182BD', min: 35, max: 45, ink: '#fff' },
    { label: '≥ R45', color: '#08519C', min: 45, ink: '#fff' },
  ]),
  stress: s('stress', 'Water stress index (demand / availability)', undefined, [
    { id: 'Low', label: '< 0.2 Low', color: '#1F6FD1', max: 0.2, ink: '#fff' },
    { id: 'Low-medium', label: '0.2–0.4 Low–medium', color: '#74B4E0', min: 0.2, max: 0.4 },
    { id: 'Medium', label: '0.4–0.6 Medium', color: '#F6CF3E', min: 0.4, max: 0.6 },
    { id: 'High', label: '0.6–0.8 High', color: '#F28C28', min: 0.6, max: 0.8 },
    { id: 'Extreme', label: '≥ 0.8 Extremely high', color: '#B2182B', min: 0.8, ink: '#fff' },
  ]),
  ratio: s('ratio', 'Value relative to guideline', '× guideline', [
    { label: '< 0.5 × guideline', color: '#1F6FD1', max: 0.5 },
    { label: '0.5–1 × (within guideline)', color: '#4CAF50', min: 0.5, max: 1.0 },
    { label: '1–2 × (exceeds)', color: '#F28C28', min: 1.0, max: 2.0 },
    { label: '> 2 × (severe exceedance)', color: '#B2182B', min: 2.0 },
  ]),
  index01: s('index01', 'Index (0–1)', undefined, [
    { id: 'Very Low', label: '< 0.2 Very low', color: '#1A9850', max: 0.2, ink: '#fff' },
    { id: 'Low', label: '0.2–0.4 Low', color: '#A6D96A', min: 0.2, max: 0.4 },
    { id: 'Medium', label: '0.4–0.6 Medium', color: '#FEE08B', min: 0.4, max: 0.6 },
    { id: 'High', label: '0.6–0.8 High', color: '#F46D43', min: 0.6, max: 0.8 },
    { id: 'Very High', label: '≥ 0.8 Very high', color: '#A50026', min: 0.8, ink: '#fff' },
  ]),
  risk: c('risk', 'Risk level', [
    { id: 'Low', label: 'Low', color: '#8BC34A' },
    { id: 'Moderate', label: 'Moderate', color: '#F6CF3E' },
    { id: 'Medium', label: 'Medium', color: '#F6CF3E' },
    { id: 'High', label: 'High', color: '#F28C28' },
    { id: 'Very High', label: 'Very high', color: '#D7301F', ink: '#fff' },
    { id: 'Extreme', label: 'Extreme', color: '#8B0000', ink: '#fff' },
    { id: 'Critical', label: 'Critical', color: '#8B0000', ink: '#fff' },
  ]),
  severity: c('severity', 'Alert severity', [
    { id: 'critical', label: 'Critical', color: '#B71C1C', ink: '#fff' },
    { id: 'high', label: 'High', color: '#E95F35', ink: '#fff' },
    { id: 'moderate', label: 'Moderate', color: '#F2A900' },
    { id: 'low', label: 'Low', color: '#8BC34A' },
    { id: 'info', label: 'Info', color: '#1565C0', ink: '#fff' },
  ]),
  status: c('status', 'Status', [
    { id: 'Normal', label: 'Normal', color: '#4CAF50' },
    { id: 'Watch', label: 'Watch', color: '#F6CF3E' },
    { id: 'Low', label: 'Low', color: '#F28C28' },
    { id: 'Warning', label: 'Warning', color: '#F28C28' },
    { id: 'Critical', label: 'Critical', color: '#D7301F', ink: '#fff' },
    { id: 'Under Maintenance', label: 'Under maintenance', color: '#1F6FD1', ink: '#fff' },
  ]),
  /** status of a database column in the backend catalogue */
  columnStatus: c('columnStatus', 'Column status', [
    { id: 'live', label: 'Live', color: '#2E9E5B', ink: '#fff' },
    { id: 'withheld', label: 'Withheld', color: '#F2A900' },
    { id: 'duplicate', label: 'Duplicate', color: '#94A3B8', ink: '#fff' },
  ]),
  feed: c('feed', 'Feed status', [
    { id: 'Online', label: 'Online', color: '#2E9E5B', ink: '#fff' },
    { id: 'Delayed', label: 'Delayed', color: '#F2A900' },
    { id: 'Degraded', label: 'Degraded', color: '#E95F35', ink: '#fff' },
    { id: 'Offline', label: 'Offline', color: '#7B8794', ink: '#fff' },
  ]),
  progress: c('progress', 'Delivery status', [
    { id: 'Completed', label: 'Completed', color: '#2E9E5B', ink: '#fff' },
    { id: 'On Track', label: 'On track', color: '#1565C0', ink: '#fff' },
    { id: 'In Progress', label: 'In progress', color: '#1565C0', ink: '#fff' },
    { id: 'At Risk', label: 'At risk', color: '#F2A900' },
    { id: 'Delayed', label: 'Delayed', color: '#E95F35', ink: '#fff' },
    { id: 'Not Started', label: 'Not started', color: '#94A3B8', ink: '#fff' },
    { id: 'Planned', label: 'Planned', color: '#94A3B8', ink: '#fff' },
  ]),
  response: c('response', 'Response status', [
    { id: 'Intervention', label: 'Intervention', color: '#E95F35', ink: '#fff' },
    { id: 'In progress', label: 'In progress', color: '#1565C0', ink: '#fff' },
    { id: 'Planned', label: 'Planned', color: '#94A3B8', ink: '#fff' },
    { id: 'Monitoring', label: 'Monitoring', color: '#8BC34A' },
  ]),
  pass: c('pass', 'Compliance', [
    { id: 'Compliant', label: 'Compliant', color: '#2E9E5B', ink: '#fff' },
    { id: 'Non-compliant', label: 'Non-compliant', color: '#C62828', ink: '#fff' },
  ]),
  trendClass: c('trendClass', 'Trend', [
    { id: 'Rising', label: 'Rising', color: '#1565C0', ink: '#fff' },
    { id: 'Stable', label: 'Stable', color: '#2E9E5B', ink: '#fff' },
    { id: 'Declining', label: 'Declining', color: '#E95F35', ink: '#fff' },
  ]),
  wq: c('wq', 'Quality', [
    { id: 'Good', label: 'Good', color: '#2E9E5B', ink: '#fff' },
    { id: 'Moderate', label: 'Moderate', color: '#F2A900' },
    { id: 'Fair', label: 'Fair', color: '#F2A900' },
    { id: 'Poor', label: 'Poor', color: '#C62828', ink: '#fff' },
  ]),
  ecological: c('ecological', 'Ecological category (PES)', [
    { id: 'A', label: 'A – Natural', color: '#1F6FD1', ink: '#fff' },
    { id: 'B', label: 'B – Largely natural', color: '#4CAF50' },
    { id: 'C', label: 'C – Moderately modified', color: '#F6CF3E' },
    { id: 'D', label: 'D – Largely modified', color: '#F28C28' },
    { id: 'E', label: 'E – Seriously modified', color: '#D7301F', ink: '#fff' },
    { id: 'F', label: 'F – Critically modified', color: '#7F0000', ink: '#fff' },
  ]),
  vegetationCover: c('vegetationCover', 'Land cover', [
    { id: 'Natural vegetation', label: 'Natural vegetation', color: '#2E9E5B' },
    { id: 'Agriculture', label: 'Agriculture', color: '#F2C14E' },
    { id: 'Rangeland', label: 'Rangeland', color: '#C9A227' },
    { id: 'Forest', label: 'Forest / plantation', color: '#1B5E20', ink: '#fff' },
    { id: 'Urban', label: 'Urban / built-up', color: '#9E9E9E' },
    { id: 'Water bodies', label: 'Water bodies', color: '#1565C0', ink: '#fff' },
    { id: 'Other', label: 'Bare / other', color: '#D7CCC8' },
  ]),
} satisfies Record<string, ScaleDef>;

export type ScaleId = keyof typeof SCALES;

export function getScale(id: ScaleId | string): ScaleDef {
  const sc = (SCALES as Record<string, ScaleDef>)[id];
  if (!sc) throw new Error(`Unknown scale ${id}`);
  return sc;
}

/** Find the bin for a value (number → threshold, string → category id). */
export function classify(
  scale: ScaleId | string | ScaleDef,
  value: number | string | null | undefined,
): ScaleBin | null {
  const sc = typeof scale === 'object' ? scale : getScale(scale);
  if (value == null || (typeof value === 'number' && Number.isNaN(value))) return null;
  if (typeof value === 'string' || sc.kind === 'category') {
    return sc.bins.find((b) => b.id === value || b.label === value) ?? null;
  }
  for (const b of sc.bins) {
    if ((b.min == null || value >= b.min) && (b.max == null || value < b.max)) return b;
  }
  return value < (sc.bins[0].max ?? -Infinity) ? sc.bins[0] : sc.bins[sc.bins.length - 1];
}

export function colorFor(scale: ScaleId | string | ScaleDef, value: number | string | null | undefined): string {
  const sc = typeof scale === 'object' ? scale : getScale(scale);
  return classify(sc, value)?.color ?? sc.noData ?? NO_DATA;
}

/** WCAG relative luminance of a #rgb / #rrggbb colour. */
function luminance(color: string): number {
  const hex = color.replace('#', '');
  const n = parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

const INK = '#13233A';
const INK_L = luminance(INK);

/** Readable text colour for a background: the navy ink or white, whichever contrasts more; when neither reaches the
 * 4.5 : 1 of WCAG AA small text (mid tones such as the "No drought" green #1A9850), pure black or white. */
export function inkFor(bg: string): string {
  const L = luminance(bg);
  const onWhite = 1.05 / (L + 0.05);
  const onInk = (L + 0.05) / (INK_L + 0.05);
  if (Math.max(onInk, onWhite) >= 4.5) return onInk >= onWhite ? INK : '#FFFFFF';
  const onBlack = (L + 0.05) / 0.05;
  return onBlack >= onWhite ? '#000000' : '#FFFFFF';
}

export function binInk(bin: ScaleBin): string {
  return inkFor(bin.color);
}
