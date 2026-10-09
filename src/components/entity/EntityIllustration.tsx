import type { EntityDetail } from '@/types/api';

type Kind = NonNullable<EntityDetail['image']>;

/**
 * Placeholder illustrations (SVG) for the entity image slot. No photos are hotlinked; DWS can later
 * supply real site photos through the API (`image` field) and this component can render them instead.
 */
export function EntityIllustration({ kind, name }: { kind: Kind; name: string }) {
  return (
    <svg
      viewBox="0 0 320 200"
      className="h-full w-full rounded-lg"
      role="img"
      aria-label={`Illustration: ${name}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`sky-${kind}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#9fd0f5" />
          <stop offset="1" stopColor="#e3f2fd" />
        </linearGradient>
        <linearGradient id={`water-${kind}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2b7bc4" />
          <stop offset="1" stopColor="#174f86" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#sky-${kind})`} />
      <path d="M0 110 L60 70 L110 95 L170 55 L240 92 L320 66 L320 200 L0 200 Z" fill="#7aa36b" opacity="0.75" />
      <path d="M0 125 L80 100 L150 118 L230 96 L320 112 L320 200 L0 200 Z" fill="#5f8a50" />
      {kind === 'dam' && (
        <>
          <path d="M0 132 Q160 118 320 132 L320 200 L0 200 Z" fill={`url(#water-${kind})`} />
          <path d="M190 128 L300 128 L310 200 L180 200 Z" fill="#c9c4b8" />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={198 + i * 20} y={132} width="10" height="30" fill="#9e978a" />
          ))}
          <path
            d="M205 162 Q215 185 205 200 M245 162 Q255 185 245 200"
            stroke="#e8f4ff"
            strokeWidth="5"
            fill="none"
            opacity="0.8"
          />
        </>
      )}
      {(kind === 'river' || kind === 'station') && (
        <>
          <path d="M0 160 Q80 140 160 158 T320 150 L320 200 L0 200 Z" fill={`url(#water-${kind})`} />
          <rect x="140" y="118" width="18" height="44" fill="#b0b8c2" />
          <rect x="132" y="110" width="34" height="12" rx="2" fill="#6b7a8c" />
          <path d="M149 110 L149 92" stroke="#6b7a8c" strokeWidth="2" />
          <circle cx="149" cy="90" r="4" fill="#ffb300" />
        </>
      )}
      {kind === 'borehole' && (
        <>
          <rect x="0" y="150" width="320" height="50" fill="#c8a879" />
          <rect x="150" y="96" width="14" height="60" fill="#2f6db5" />
          <rect x="140" y="92" width="34" height="10" rx="3" fill="#1f4f8a" />
          <path d="M174 110 L210 110 L210 128" stroke="#2f6db5" strokeWidth="5" fill="none" />
        </>
      )}
      {(kind === 'wwtw' || kind === 'wtp') && (
        <>
          <rect x="0" y="140" width="320" height="60" fill="#a9b7a2" />
          {[60, 150, 240].map((cx) => (
            <g key={cx}>
              <ellipse cx={cx} cy="160" rx="38" ry="14" fill="#7b8a8f" />
              <ellipse cx={cx} cy="158" rx="32" ry="10" fill={kind === 'wwtw' ? '#6f8f6a' : '#3f8fd1'} />
            </g>
          ))}
          <rect x="250" y="104" width="44" height="30" fill="#e0e4e8" />
        </>
      )}
      {kind === 'settlement' && (
        <>
          {[30, 80, 130, 180, 230, 275].map((x, i) => (
            <g key={x}>
              <rect
                x={x}
                y={136 - (i % 2) * 6}
                width="34"
                height="26"
                fill={['#e8d5b5', '#d9c3a0', '#c9d6e3'][i % 3]}
              />
              <path
                d={`M${x - 3} ${136 - (i % 2) * 6} L${x + 17} ${122 - (i % 2) * 6} L${x + 37} ${136 - (i % 2) * 6} Z`}
                fill="#8d6e63"
              />
            </g>
          ))}
          <rect x="0" y="162" width="320" height="38" fill="#c8a879" />
          <rect x="150" y="128" width="16" height="34" fill="#2f6db5" />
        </>
      )}
      {(kind === 'aquifer' || kind === 'municipality') && (
        <>
          <rect x="0" y="130" width="320" height="22" fill="#d7b98e" />
          <rect x="0" y="152" width="320" height="22" fill="#b98f5f" />
          <rect x="0" y="174" width="320" height="26" fill="#6f88a8" />
          <path
            d="M0 176 Q80 170 160 178 T320 174"
            stroke="#2b7bc4"
            strokeWidth="3"
            strokeDasharray="6 4"
            fill="none"
          />
        </>
      )}
    </svg>
  );
}
