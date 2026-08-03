type CampfireProps = {
  className?: string;
  width?: number;
  height?: number;
};

/**
 * Small custom-drawn bonfire for the "resting at camp" state. Same rationale
 * as Climber.tsx — isolated so a real Kenney.nl sprite can replace it later.
 */
export function Campfire({ className, width, height }: CampfireProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      width={width}
      height={height}
      role="img"
      aria-label="A campfire"
    >
      {/* logs */}
      <rect x="6" y="24" width="20" height="4" rx="1.5" fill="#6b4a34" transform="rotate(-8 16 26)" />
      <rect x="6" y="24" width="20" height="4" rx="1.5" fill="#4f3626" transform="rotate(8 16 26)" />
      {/* flame */}
      <path
        d="M16 6c3 4-2 6-1 10 0.5 2 3 2.5 3 5a4 4 0 0 1-8 0c0-2 1.5-3 1-6-2 1-3 3-3 5a6 6 0 0 0 12 0c0-6-5-8-4-14z"
        fill="var(--color-amber)"
      />
      <path
        d="M16 14c1.5 2-0.5 3-0.2 5.5 0.2 1.2 1.7 1.5 1.7 3a2.5 2.5 0 0 1-5 0c0-1.2 1-1.8 0.6-3.3-1 0.6-1.6 1.6-1.6 2.8a3.5 3.5 0 0 0 7 0c0-3.4-2.8-4.6-2.5-8z"
        fill="var(--color-gold)"
      />
    </svg>
  );
}
