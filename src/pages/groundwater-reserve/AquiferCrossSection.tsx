/**
 * Schematic aquifer cross-section (NW → SE): topsoil, weathered zone, fractured aquifer, confining layer,
 * monitoring boreholes with water levels, recharge arrows and discharge to a river. Illustrative only.
 */
export function AquiferCrossSection() {
  const ground = 'M0 60 C 80 52 150 66 230 58 S 380 48 470 62 L 560 70 L 560 0 L 0 0 Z';
  const layer = (y1: number, y2: number) => `M0 ${y1} C 120 ${y1 - 6} 260 ${y1 + 8} 400 ${y1 + 2} S 520 ${y1 + 8} 560 ${y1 + 6} L 560 ${y2} L 0 ${y2} Z`;
  const wt = 'M0 92 C 100 88 200 104 300 98 S 470 112 560 118';
  const holes = [90, 210, 330, 450];
  return (
    <figure>
      <svg viewBox="0 0 560 300" className="w-full" role="img" aria-label="Aquifer cross-section: topsoil, weathered zone, fractured aquifer and confining layer with boreholes, water table and recharge">
        <rect width="560" height="300" fill="var(--c-surface-2)" />
        <path d={layer(58, 300)} fill="#EAD9B9" />
        <path d={layer(78, 300)} fill="#E7B8A3" />
        <path d={layer(140, 300)} fill="#B8C9DB" />
        <path d={layer(235, 300)} fill="#B08B6A" />
        <path d={ground} fill="#CFE8F7" />
        {/* fracture pattern */}
        {Array.from({ length: 22 }, (_, k) => (
          <path key={k} d={`M${20 + k * 25} ${155 + (k % 3) * 18} l14 ${-10 + (k % 2) * 20}`} stroke="#7E95B0" strokeWidth="1.2" />
        ))}
        {/* water table */}
        <path d={wt} fill="none" stroke="#1565C0" strokeWidth="2.2" strokeDasharray="7 4" />
        <text x="8" y="86" fontSize="11" fill="#1565C0" fontWeight="600">
          Water table
        </text>
        {/* river (discharge) */}
        <path d="M520 66 q 20 8 40 4 l 0 6 q -20 6 -40 -2 z" fill="#1E88E5" />
        <text x="488" y="54" fontSize="11" fill="var(--c-text)">
          Discharge to river →
        </text>
        {/* recharge arrows */}
        {[150, 300].map((x) => (
          <g key={x} stroke="#1565C0" strokeWidth="2" fill="#1565C0">
            <line x1={x} y1="10" x2={x} y2="44" />
            <path d={`M${x - 5} 40 L${x} 50 L${x + 5} 40 Z`} />
            <text x={x + 8} y="22" fontSize="11" stroke="none" fill="var(--c-text)">
              Recharge
            </text>
          </g>
        ))}
        {/* boreholes */}
        {holes.map((x, k) => {
          const wl = 92 + (x / 560) * 26 + Math.sin(k) * 3;
          return (
            <g key={x}>
              <rect x={x - 4} y="48" width="8" height="190" fill="#F5F7FA" stroke="#13233A" strokeWidth="1.2" />
              <rect x={x - 3} y={wl} width="6" height={238 - wl} fill="#64B5F6" opacity="0.8" />
              <line x1={x - 9} y1={wl} x2={x + 9} y2={wl} stroke="#0B1F3A" strokeWidth="2" />
              <text x={x - 16} y="44" fontSize="10" fill="var(--c-text)">
                BH-{k + 1}
              </text>
            </g>
          );
        })}
        {/* depth axis */}
        {[0, 100, 200, 300, 400].map((d, k) => (
          <text key={d} x="548" y={70 + k * 55} fontSize="10" textAnchor="end" fill="var(--c-muted)">
            {d} m
          </text>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-2">
        {[
          ['#EAD9B9', 'Topsoil'],
          ['#E7B8A3', 'Weathered zone'],
          ['#B8C9DB', 'Fractured zone (aquifer)'],
          ['#B08B6A', 'Confining layer'],
        ].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="h-3 w-4 rounded-sm border border-black/10" style={{ background: c }} aria-hidden="true" />
            {l}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
