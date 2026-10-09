import { useState } from 'react';
import clsx from 'clsx';

/**
 * DWS logo slot. Reads /brand/dws-logo.svg; if the file is missing renders a neutral placeholder
 * (the official asset is supplied separately by DWS).
 */
export function DwsLogo({ compact = false }: { compact?: boolean }) {
  const [missing, setMissing] = useState(false);
  if (!missing) {
    return (
      <img
        src="/brand/dws-logo.svg"
        alt="Department of Water and Sanitation"
        className={clsx('object-contain', compact ? 'h-9 w-9' : 'h-12 w-auto max-w-[200px]')}
        onError={() => setMissing(true)}
      />
    );
  }
  return (
    <div className="flex items-center gap-2" aria-label="Department of Water and Sanitation, Republic of South Africa (logo placeholder)" role="img">
      <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden="true">
        <rect width="40" height="40" rx="9" fill="#ffffff" fillOpacity="0.08" stroke="#ffffff" strokeOpacity="0.25" />
        <path d="M20 7c-5.6 7.4-10 12.6-10 17.4a10 10 0 0 0 20 0C30 19.6 25.6 14.4 20 7z" fill="#3B8EEA" />
        <path d="M14.5 25.5c1.9 2.5 4.6 3.2 7.5 2.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {!compact && (
        <div className="leading-tight">
          <div className="text-[13px] font-semibold text-white">
            water <span className="text-[#7fd36b]">&amp;</span> sanitation
          </div>
          <div className="text-[11px] text-nav-text">
            Department: Water and Sanitation
            <br />
            REPUBLIC OF SOUTH AFRICA
          </div>
        </div>
      )}
    </div>
  );
}
