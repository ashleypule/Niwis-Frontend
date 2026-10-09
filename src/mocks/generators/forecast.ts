/**
 * Forecast generation: damped persistence towards the climatological mean with a deterministic seasonal outlook
 * signal, and an uncertainty band (p10/p90) that widens with the horizon.
 *   median(h) = μ + (x₀ − μ)·φʰ + outlook(h)
 *   σ(h)      = σ∞ · √(1 − φ²ʰ)
 *   p10/p90   = median ∓ 1.2816 σ(h)
 */
import { Rng } from '@/lib/prng';
import { miToIso } from '@/lib/time';

export interface ForecastPoint {
  mi: number;
  median: number;
  p10: number;
  p90: number;
}

export function dampedForecast(
  key: string,
  x0: number,
  opts: {
    mu: number;
    phi: number;
    sigma: number;
    horizon: number;
    startMi: number;
    outlook?: number;
    min?: number;
    max?: number;
    seasonal?: (mi: number) => number;
  },
): ForecastPoint[] {
  const r = new Rng(`fc-${key}`);
  const out: ForecastPoint[] = [];
  const drift = opts.outlook ?? r.normal(0, 0.15) * opts.sigma;
  for (let h = 1; h <= opts.horizon; h++) {
    const mi = opts.startMi + h;
    const season = opts.seasonal ? opts.seasonal(mi) : 0;
    let med = opts.mu + (x0 - opts.mu) * Math.pow(opts.phi, h) + drift * Math.min(1, h / 3) + season;
    const s = opts.sigma * Math.sqrt(1 - Math.pow(opts.phi, 2 * h)) + opts.sigma * 0.05;
    let lo = med - 1.2816 * s;
    let hi = med + 1.2816 * s;
    if (opts.min != null) {
      med = Math.max(opts.min, med);
      lo = Math.max(opts.min, lo);
    }
    if (opts.max != null) {
      med = Math.min(opts.max, med);
      hi = Math.min(opts.max, hi);
    }
    out.push({ mi, median: med, p10: lo, p90: hi });
  }
  return out;
}

/** History + forecast series in the SeriesSet shape: [observed, median, band]. */
export function forecastSeries(
  history: [number, number | null][],
  fc: ForecastPoint[],
  names = { obs: 'Observed', median: 'Forecast (median)', band: 'Uncertainty (10th–90th pct)' },
) {
  const lastObs = history[history.length - 1];
  return {
    observed: history.map(([mi, v]) => [miToIso(mi), v] as [string, number | null]),
    median: [
      [miToIso(lastObs[0]), lastObs[1]] as [string, number | null],
      ...fc.map((p) => [miToIso(p.mi), p.median] as [string, number | null]),
    ],
    band: [
      [miToIso(lastObs[0]), lastObs[1], lastObs[1]] as [string, number | null, number | null],
      ...fc.map((p) => [miToIso(p.mi), p.p10, p.p90] as [string, number | null, number | null]),
    ],
    names,
  };
}
