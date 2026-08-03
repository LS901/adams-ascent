type ClimberProps = {
  className?: string;
  resting?: boolean;
  /** Explicit width/height in the parent SVG's coordinate units — use these
   * instead of `className` sizing when nesting inside another <svg>. */
  width?: number;
  height?: number;
};

/**
 * A small, warm, custom-drawn hiker — the one illustrated/characterful
 * element in an otherwise calm, map-like scene. Kept as its own component so
 * a real Kenney.nl sprite sheet can be swapped in later without touching any
 * of the position-along-path logic that places it.
 */
export function Climber({ className, resting = false, width, height }: ClimberProps) {
  return (
    <svg
      viewBox="0 0 40 48"
      className={className}
      width={width}
      height={height}
      role="img"
      aria-label={resting ? "Adam resting at camp" : "Adam climbing"}
    >
      {/* backpack */}
      <rect x="10" y="18" width="10" height="14" rx="3" fill="var(--color-pine)" />
      {/* body */}
      <rect x="14" y="16" width="12" height="18" rx="5" fill="var(--color-amber)" />
      {/* head */}
      <circle cx="20" cy="10" r="8" fill="#e8b48a" />
      {/* beanie */}
      <path d="M12 9a8 8 0 0 1 16 0z" fill="var(--color-ember)" />
      {/* legs */}
      {resting ? (
        <>
          <rect x="14" y="32" width="5" height="10" rx="2" fill="var(--color-navy)" />
          <rect x="21" y="32" width="5" height="10" rx="2" fill="var(--color-navy)" />
        </>
      ) : (
        <>
          <rect x="12" y="32" width="5" height="12" rx="2" fill="var(--color-navy)" transform="rotate(-12 14 32)" />
          <rect x="22" y="32" width="5" height="12" rx="2" fill="var(--color-navy)" transform="rotate(12 24 32)" />
        </>
      )}
      {/* walking stick */}
      {!resting ? (
        <line x1="28" y1="20" x2="32" y2="44" stroke="var(--color-gold-dim)" strokeWidth="2" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}
