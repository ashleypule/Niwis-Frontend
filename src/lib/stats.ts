/**
 * Statistics used to derive indices from raw series:
 * SPI (McKee 1993, gamma fit), SPEI (Vicente-Serrano 2010, log-logistic PWM fit), standardised indices
 * (SSI / SGI), Sen's slope + Mann–Kendall, log-Pearson III flood frequency, descriptive statistics.
 */

export const mean = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
export const sum = (a: number[]): number => a.reduce((s, v) => s + v, 0);
export function sd(a: number[]): number {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1));
}
export const cv = (a: number[]): number => sd(a) / mean(a);
export function quantile(a: number[], q: number): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const round = (v: number, d = 0): number => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

// ---------------------------------------------------------------- special functions
const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lnGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * z))) - lnGamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) x += LANCZOS[i] / (z + i + 1);
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function gammaFn(z: number): number {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  return Math.exp(lnGamma(z));
}

/** Regularised lower incomplete gamma P(a, x). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a;
    let del = 1 / a;
    let s = del;
    for (let n = 0; n < 200; n++) {
      ap += 1;
      del *= x / ap;
      s += del;
      if (Math.abs(del) < Math.abs(s) * 1e-12) break;
    }
    return s * Math.exp(-x + a * Math.log(x) - lnGamma(a));
  }
  // continued fraction for Q, P = 1 − Q
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

/** Standard normal CDF. */
export function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/** Inverse standard normal CDF (Acklam). */
export function normInv(p: number): number {
  const pp = clamp(p, 1e-10, 1 - 1e-10);
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239,
  ];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968,
    2.938163982698783,
  ];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (pp < pl) {
    const q = Math.sqrt(-2 * Math.log(pp));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (pp > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - pp));
    return (
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  const q = pp - 0.5;
  const r = q * q;
  return (
    ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  );
}

// ---------------------------------------------------------------- rolling accumulation
/** k-month rolling sum; first k−1 entries are null. */
export function rollingSum(series: number[], k: number): (number | null)[] {
  const out: (number | null)[] = new Array(series.length).fill(null);
  let acc = 0;
  for (let i = 0; i < series.length; i++) {
    acc += series[i];
    if (i >= k) acc -= series[i - k];
    if (i >= k - 1) out[i] = acc;
  }
  return out;
}

// ---------------------------------------------------------------- SPI (gamma, per calendar month)
export interface MonthlySeries {
  /** first month index: year*12 + month(0-11) */
  start: number;
  values: number[];
}

/**
 * SPI at timescale k. Gamma distribution fitted per calendar month on the calibration window
 * (Thom 1958 MLE approximation), with the zero-probability mixture q (McKee et al. 1993).
 */
export function spi(series: MonthlySeries, k: number, calib: { from: number; to: number }): (number | null)[] {
  const acc = rollingSum(series.values, k);
  const out: (number | null)[] = new Array(acc.length).fill(null);
  for (let m = 0; m < 12; m++) {
    const idx: number[] = [];
    const cal: number[] = [];
    for (let i = 0; i < acc.length; i++) {
      const abs = series.start + i;
      if (abs % 12 !== m || acc[i] == null) continue;
      idx.push(i);
      const y = Math.floor(abs / 12);
      if (y >= calib.from && y <= calib.to) cal.push(acc[i]!);
    }
    const fitSet = cal.length >= 10 ? cal : idx.map((i) => acc[i]!);
    const pos = fitSet.filter((v) => v > 0);
    const q = (fitSet.length - pos.length) / fitSet.length;
    if (pos.length < 3) continue;
    const mu = mean(pos);
    const A = Math.log(mu) - mean(pos.map(Math.log));
    const alpha = A > 0 ? (1 + Math.sqrt(1 + (4 * A) / 3)) / (4 * A) : 50;
    const beta = mu / alpha;
    for (const i of idx) {
      const x = acc[i]!;
      const H = q + (1 - q) * (x > 0 ? gammaP(alpha, x / beta) : 0);
      out[i] = clamp(normInv(H), -3.5, 3.5);
    }
  }
  return out;
}

// ---------------------------------------------------------------- SPEI (log-logistic, PWM)
function loglogisticParams(xs: number[]): { alpha: number; beta: number; gamma: number } {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  // unbiased probability-weighted moments w_s = 1/n Σ (1 − F_i)^s x_i, F_i = (i − 0.35)/n
  let w0 = 0;
  let w1 = 0;
  let w2 = 0;
  for (let i = 0; i < n; i++) {
    const F = (i + 1 - 0.35) / n;
    w0 += s[i];
    w1 += (1 - F) * s[i];
    w2 += (1 - F) ** 2 * s[i];
  }
  w0 /= n;
  w1 /= n;
  w2 /= n;
  let beta = (2 * w1 - w0) / (6 * w1 - w0 - 6 * w2);
  if (!Number.isFinite(beta) || beta <= 1.05) beta = 1.05;
  const g1 = gammaFn(1 + 1 / beta);
  const g2 = gammaFn(1 - 1 / beta);
  const alpha = ((w0 - 2 * w1) * beta) / (g1 * g2);
  const gamma = w0 - alpha * g1 * g2;
  return { alpha, beta, gamma };
}

/**
 * SPEI at timescale k from a monthly climatic water balance D = P − PET. The accumulated balance is standardised
 * per calendar month against the calibration window with a moment-fitted distribution (normal; robust for the
 * short 30-year SA calibration samples where the 3-parameter log-logistic fit can be unstable).
 */
export function spei(balance: MonthlySeries, k: number, calib: { from: number; to: number }): (number | null)[] {
  const acc = rollingSum(balance.values, k);
  const out: (number | null)[] = new Array(acc.length).fill(null);
  for (let m = 0; m < 12; m++) {
    const idx: number[] = [];
    const cal: number[] = [];
    for (let i = 0; i < acc.length; i++) {
      const abs = balance.start + i;
      if (abs % 12 !== m || acc[i] == null) continue;
      idx.push(i);
      const y = Math.floor(abs / 12);
      if (y >= calib.from && y <= calib.to) cal.push(acc[i]!);
    }
    const fit = cal.length >= 10 ? cal : idx.map((i) => acc[i]!);
    if (fit.length < 5) continue;
    const mu = mean(fit);
    const s = sd(fit) || 1;
    for (const i of idx) out[i] = clamp((acc[i]! - mu) / s, -3.5, 3.5);
  }
  return out;
}

/** Log-logistic parameters by probability-weighted moments (Vicente-Serrano et al. 2010) — kept for reference/tests. */
export { loglogisticParams };

/**
 * Generic standardised index (SSI / SGI / RSI): per calendar month, empirical (Gringorten) plotting position of
 * each value within the calibration sample, mapped through the inverse normal. Non-parametric, as recommended
 * for streamflow and groundwater (Bloomfield & Marchant 2013).
 */
export function standardisedIndex(
  series: MonthlySeries,
  calib: { from: number; to: number },
  invert = false,
): (number | null)[] {
  const out: (number | null)[] = new Array(series.values.length).fill(null);
  for (let m = 0; m < 12; m++) {
    const idx: number[] = [];
    const cal: number[] = [];
    series.values.forEach((v, i) => {
      const abs = series.start + i;
      if (abs % 12 !== m || v == null || Number.isNaN(v)) return;
      idx.push(i);
      const y = Math.floor(abs / 12);
      if (y >= calib.from && y <= calib.to) cal.push(v);
    });
    const ref = (cal.length >= 8 ? cal : idx.map((i) => series.values[i])).sort((a, b) => a - b);
    const n = ref.length;
    for (const i of idx) {
      const v = series.values[i];
      let rank = 0;
      while (rank < n && ref[rank] <= v) rank++;
      const p = (rank - 0.44) / (n + 0.12);
      const z = clamp(normInv(clamp(p, 0.001, 0.999)), -3, 3);
      out[i] = invert ? -z : z;
    }
  }
  return out;
}

// ---------------------------------------------------------------- trends
/** Sen's slope (median of pairwise slopes) per time unit. */
export function sensSlope(ys: number[], xs?: number[]): number {
  const x = xs ?? ys.map((_, i) => i);
  const slopes: number[] = [];
  for (let i = 0; i < ys.length; i++)
    for (let j = i + 1; j < ys.length; j++) if (x[j] !== x[i]) slopes.push((ys[j] - ys[i]) / (x[j] - x[i]));
  return quantile(slopes, 0.5);
}

/** Mann–Kendall trend test (no ties correction). Returns S, Z and two-sided p. */
export function mannKendall(ys: number[]): {
  s: number;
  z: number;
  p: number;
  trend: 'Increasing' | 'Decreasing' | 'No trend';
} {
  const n = ys.length;
  let s = 0;
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) s += Math.sign(ys[j] - ys[i]);
  const varS = (n * (n - 1) * (2 * n + 5)) / 18;
  const z = s > 0 ? (s - 1) / Math.sqrt(varS) : s < 0 ? (s + 1) / Math.sqrt(varS) : 0;
  const p = 2 * (1 - normCdf(Math.abs(z)));
  return { s, z, p, trend: p < 0.05 ? (z > 0 ? 'Increasing' : 'Decreasing') : 'No trend' };
}

export function linearFit(ys: number[], xs?: number[]): { slope: number; intercept: number; r2: number } {
  const x = xs ?? ys.map((_, i) => i);
  const mx = mean(x);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < ys.length; i++) {
    sxy += (x[i] - mx) * (ys[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy ? (sxy * sxy) / (sxx * syy) : 0 };
}

export function pearson(a: number[], b: number[]): number {
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

// ---------------------------------------------------------------- flood frequency
function skewness(a: number[]): number {
  const n = a.length;
  const m = mean(a);
  const s = sd(a);
  return (n / ((n - 1) * (n - 2))) * a.reduce((acc, v) => acc + ((v - m) / s) ** 3, 0) || 0;
}

/** Log-Pearson III quantile for a return period T (years) from annual maxima. Wilson–Hilferty frequency factor. */
export function logPearson3(annualMax: number[], T: number): number {
  const logs = annualMax.filter((v) => v > 0).map(Math.log10);
  const m = mean(logs);
  const s = sd(logs);
  const g = skewness(logs);
  const z = normInv(1 - 1 / T);
  const K = Math.abs(g) < 1e-6 ? z : (2 / g) * ((1 + (g * z) / 6 - (g * g) / 36) ** 3 - 1);
  return 10 ** (m + K * s);
}

/** Weibull plotting positions for observed annual maxima → [returnPeriod, value][]. */
export function plottingPositions(annualMax: number[]): [number, number][] {
  const s = [...annualMax].sort((a, b) => b - a);
  const n = s.length;
  return s.map((v, i) => [(n + 1) / (i + 1), v]);
}

/** Flow duration curve: exceedance % → flow. */
export function flowDuration(flows: number[], points = 50): [number, number][] {
  const s = [...flows].filter((v) => v >= 0).sort((a, b) => b - a);
  const out: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const p = (i / points) * 100;
    const idx = Math.min(s.length - 1, Math.round((p / 100) * (s.length - 1)));
    out.push([Math.round(p * 10) / 10, s[idx]]);
  }
  return out;
}

/** Lyne–Hollick one-parameter digital filter baseflow separation (α = 0.925, single forward pass). */
export function baseflowSeparation(q: number[], alpha = 0.925): number[] {
  const bf: number[] = new Array(q.length).fill(0);
  let qf = 0;
  for (let i = 0; i < q.length; i++) {
    if (i === 0) {
      qf = q[0] * 0.5;
    } else {
      qf = alpha * qf + ((1 + alpha) / 2) * (q[i] - q[i - 1]);
      if (qf < 0) qf = 0;
    }
    bf[i] = Math.max(0, Math.min(q[i], q[i] - qf));
  }
  return bf;
}
