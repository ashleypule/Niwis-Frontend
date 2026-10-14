import clsx from 'clsx';

const LOGO_SRC = '/brand/dws-logo.png';
const ALT = 'Department of Water and Sanitation, Republic of South Africa';

/**
 * Official DWS logo (public/brand/dws-logo.png, 238 × 86, opaque off-white background).
 * Shown on a plate of the same off-white so it reads on the dark sidebar and report covers;
 * `compact` (collapsed sidebar rail) crops to the coat of arms.
 */
export function DwsLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  if (compact) {
    return (
      <span
        className={clsx(
          'inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-[#fff8f4]',
          className,
        )}
      >
        {/* coat of arms occupies the left ~27% of the image */}
        <img src={LOGO_SRC} alt={ALT} className="h-9 w-auto max-w-none translate-x-[calc(50%-15px)]" />
      </span>
    );
  }
  return (
    <span className={clsx('inline-flex self-start rounded-lg bg-[#fff8f4] px-1.5 py-1', className)}>
      <img src={LOGO_SRC} alt={ALT} width={238} height={86} className="h-12 w-auto" />
    </span>
  );
}
