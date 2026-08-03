import { describe, expect, it } from "vitest";
import {
  altitudeSamplesToPoints,
  altitudeToChartY,
  areaPathFromLine,
  smoothLinePath,
} from "../../lib/chart";

const VIEWBOX = { width: 340, height: 220, padding: 20 };

describe("altitudeSamplesToPoints", () => {
  it("returns an empty array for no samples", () => {
    expect(altitudeSamplesToPoints([], 5000, VIEWBOX)).toEqual([]);
  });

  it("places a single sample at the right edge, scaled by altitude", () => {
    const [point] = altitudeSamplesToPoints([{ altitude: 2500 }], 5000, VIEWBOX);
    expect(point?.x).toBe(VIEWBOX.width - VIEWBOX.padding);
    // half of max altitude -> vertically centered within the padded area
    expect(point?.y).toBeCloseTo(VIEWBOX.height / 2, 5);
  });

  it("spreads multiple samples evenly across the chart width", () => {
    const points = altitudeSamplesToPoints(
      [{ altitude: 0 }, { altitude: 2500 }, { altitude: 5000 }],
      5000,
      VIEWBOX,
    );
    expect(points[0]?.x).toBe(VIEWBOX.padding);
    expect(points[2]?.x).toBe(VIEWBOX.width - VIEWBOX.padding);
    expect(points[1]?.x).toBeCloseTo((VIEWBOX.width) / 2, 5);
  });

  it("altitude 0 sits at the bottom, max altitude at the top", () => {
    const points = altitudeSamplesToPoints([{ altitude: 0 }, { altitude: 5000 }], 5000, VIEWBOX);
    expect(points[0]?.y).toBe(VIEWBOX.height - VIEWBOX.padding);
    expect(points[1]?.y).toBe(VIEWBOX.padding);
  });

  it("clamps altitudes above the max to the top of the chart", () => {
    const points = altitudeSamplesToPoints([{ altitude: 9000 }], 5000, VIEWBOX);
    expect(points[0]?.y).toBe(VIEWBOX.padding);
  });
});

describe("altitudeToChartY", () => {
  it("matches the same scale as altitudeSamplesToPoints", () => {
    expect(altitudeToChartY(0, 5000, VIEWBOX)).toBe(VIEWBOX.height - VIEWBOX.padding);
    expect(altitudeToChartY(5000, 5000, VIEWBOX)).toBe(VIEWBOX.padding);
  });
});

describe("smoothLinePath", () => {
  it("returns an empty string for no points", () => {
    expect(smoothLinePath([])).toBe("");
  });

  it("returns a bare move command for a single point", () => {
    expect(smoothLinePath([{ x: 5, y: 5 }])).toBe("M 5 5");
  });

  it("starts with M and uses one C command per segment", () => {
    const points = [
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 20, y: 10 },
    ];
    const d = smoothLinePath(points);
    expect(d.startsWith("M 0 10")).toBe(true);
    expect(d.match(/C /g)).toHaveLength(2);
  });
});

describe("areaPathFromLine", () => {
  it("closes the curve down to the baseline for a fill", () => {
    const points = [
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ];
    const line = smoothLinePath(points);
    const area = areaPathFromLine(line, points, 20);
    expect(area).toContain("L 10 20");
    expect(area).toContain("L 0 20");
    expect(area.endsWith("Z")).toBe(true);
  });

  it("returns an empty string when there are no points", () => {
    expect(areaPathFromLine("", [], 20)).toBe("");
  });
});
