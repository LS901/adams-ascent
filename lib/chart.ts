export type Point = {
  x: number;
  y: number;
};

export const CHART_VIEWBOX = { width: 340, height: 220, padding: 20 } as const;

export type AltitudeSample = { altitude: number };

/**
 * Maps altitude-history samples (in chronological order) onto SVG
 * coordinates: x spreads evenly across the chart width by event order, y is
 * scaled against the fixed max altitude so the chart always reads as
 * "how far up the whole mountain," not a zoomed-in view of just what's
 * visible.
 */
export function altitudeSamplesToPoints(
  samples: readonly AltitudeSample[],
  maxAltitude: number,
  viewBox: { width: number; height: number; padding: number } = CHART_VIEWBOX,
): Point[] {
  const { width, height, padding } = viewBox;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  if (samples.length === 0) {
    return [];
  }

  if (samples.length === 1) {
    const only = samples[0];
    const altitude = only?.altitude ?? 0;
    const y = height - padding - (Math.min(altitude, maxAltitude) / maxAltitude) * innerHeight;
    return [{ x: width - padding, y }];
  }

  return samples.map((sample, i) => {
    const x = padding + (i / (samples.length - 1)) * innerWidth;
    const y = height - padding - (Math.min(sample.altitude, maxAltitude) / maxAltitude) * innerHeight;
    return { x, y };
  });
}

/** Maps a single altitude value (e.g. a camp threshold) to its chart y position. */
export function altitudeToChartY(
  altitude: number,
  maxAltitude: number,
  viewBox: { height: number; padding: number } = CHART_VIEWBOX,
): number {
  const { height, padding } = viewBox;
  const innerHeight = height - padding * 2;
  return height - padding - (Math.min(altitude, maxAltitude) / maxAltitude) * innerHeight;
}

/**
 * A smooth curve through the given points (Catmull-Rom approximated with
 * cubic Beziers) — this is what makes the line read like a real elevation
 * profile instead of a jagged connect-the-dots chart.
 */
export function smoothLinePath(points: readonly Point[]): string {
  if (points.length === 0) {
    return "";
  }
  const first = points[0];
  if (!first) {
    return "";
  }
  if (points.length === 1) {
    return `M ${first.x} ${first.y}`;
  }

  const commands: string[] = [`M ${first.x} ${first.y}`];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];
    if (!p0 || !p1 || !p2 || !p3) {
      continue;
    }

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    commands.push(`C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`);
  }

  return commands.join(" ");
}

/** Closes a smoothed line down to a baseline y, for a filled area under the curve. */
export function areaPathFromLine(
  linePathD: string,
  points: readonly Point[],
  baselineY: number,
): string {
  if (points.length === 0 || !linePathD) {
    return "";
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) {
    return "";
  }
  return `${linePathD} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
}
