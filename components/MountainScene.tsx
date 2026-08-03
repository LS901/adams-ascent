import {
  altitudeSamplesToPoints,
  altitudeToChartY,
  areaPathFromLine,
  smoothLinePath,
  CHART_VIEWBOX,
} from "../lib/chart";
import { MAX_ALTITUDE } from "../lib/constants";
import { Climber } from "./Climber";
import { Campfire } from "./Campfire";

export type SceneSample = {
  altitude: number;
};

// A camp's mountain line is claimed the moment it's completed — which camp
// (if any) sits on a given line is earned by completion order, not preset,
// so `milestone` is null for a line nobody has reached yet.
export type MountainLine = {
  threshold: number;
  milestone: { id: number; title: string } | null;
};

type MountainSceneProps = {
  altitude: number;
  history: SceneSample[];
  lines: MountainLine[];
  resting: boolean;
};

const { width, height, padding } = CHART_VIEWBOX;
const baselineY = height - padding;

export function MountainScene({ altitude, history, lines, resting }: MountainSceneProps) {
  const points = altitudeSamplesToPoints(history, MAX_ALTITUDE);
  const linePath = smoothLinePath(points);
  const areaPath = areaPathFromLine(linePath, points, baselineY);
  const currentPoint = points[points.length - 1] ?? { x: width - padding, y: baselineY };
  // Clamped so the climber sprite (drawn ~34 units above its point) never
  // clips the top of the scene when altitude nears the max.
  const climberY = Math.max(currentPoint.y - 34, 4);

  return (
    <div className="w-full max-w-sm mx-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Progress chart: ${altitude} of ${MAX_ALTITUDE} altitude reached`}
      >
        <defs>
          <linearGradient id="sceneGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-navy)" />
            <stop offset="100%" stopColor="var(--color-navy-deep)" />
          </linearGradient>
          <linearGradient id="fillGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-amber)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--color-amber)" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width={width} height={height} rx="16" fill="url(#sceneGradient)" />

        {lines.map((line, i) => {
          const reached = line.milestone !== null;
          const y = altitudeToChartY(line.threshold, MAX_ALTITUDE);
          return (
            <g key={line.milestone?.id ?? `unclaimed-${i}`}>
              <line
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke={reached ? "var(--color-gold)" : "var(--color-cream)"}
                strokeOpacity={reached ? 0.5 : 0.15}
                strokeWidth="1"
                strokeDasharray="3 4"
              />
            </g>
          );
        })}

        {areaPath ? <path d={areaPath} fill="url(#fillGradient)" /> : null}
        {linePath ? (
          <path d={linePath} fill="none" stroke="var(--color-amber)" strokeWidth="2.5" strokeLinecap="round" />
        ) : null}

        <g transform={`translate(${currentPoint.x - 16}, ${climberY})`}>
          {resting ? (
            <>
              <Campfire width={18} height={18} />
              <g transform="translate(16, -2)">
                <Climber resting width={20} height={24} />
              </g>
            </>
          ) : (
            <Climber width={32} height={38} />
          )}
        </g>
      </svg>

      <p className="mt-2 text-center font-mono text-sm text-cream/80">
        {altitude} / {MAX_ALTITUDE}m
      </p>
    </div>
  );
}
