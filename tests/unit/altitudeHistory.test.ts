import { describe, expect, it } from "vitest";
import { computeAltitude, computeAltitudeHistory } from "../../lib/altitude";

describe("computeAltitudeHistory", () => {
  it("starts at zero and rises with each done task, in chronological order", () => {
    // totalCampCount 1 with a single camp's own threshold at MAX_ALTITUDE
    // (5000) keeps the cap a no-op here — these weights never approach it.
    const history = computeAltitudeHistory(
      [
        { milestoneId: 1, status: "done", weight: 60, resolvedAt: new Date("2026-01-02") },
        { milestoneId: 1, status: "done", weight: 40, resolvedAt: new Date("2026-01-01") },
      ],
      [],
      1,
    );

    expect(history.map((p) => p.altitude)).toEqual([0, 40, 100]);
  });

  it("dips on a blip between done tasks, interleaved chronologically", () => {
    const history = computeAltitudeHistory(
      [
        { milestoneId: 1, status: "done", weight: 100, resolvedAt: new Date("2026-01-01") },
        { milestoneId: 2, status: "done", weight: 60, resolvedAt: new Date("2026-01-03") },
      ],
      [{ amount: 25, createdAt: new Date("2026-01-02") }],
      1,
    );

    expect(history.map((p) => p.altitude)).toEqual([0, 100, 75, 135]);
  });

  it("floors each running point at zero rather than going negative", () => {
    const history = computeAltitudeHistory([], [{ amount: 40, createdAt: new Date("2026-01-01") }], 1);
    expect(history.map((p) => p.altitude)).toEqual([0, 0]);
  });

  it("returns a single origin point when there is no history yet", () => {
    const history = computeAltitudeHistory([], [], 1);
    expect(history).toHaveLength(1);
    expect(history[0]?.altitude).toBe(0);
  });

  it("ends at the same value computeAltitude would give, when nothing is capped", () => {
    const tasks = [
      { milestoneId: 1, status: "done" as const, weight: 60, resolvedAt: new Date("2026-01-01") },
      { milestoneId: 1, status: "done" as const, weight: 90, resolvedAt: new Date("2026-01-02") },
    ];
    const blips = [{ amount: 25, createdAt: new Date("2026-01-03") }];

    const history = computeAltitudeHistory(tasks, blips, 1);
    expect(history.at(-1)?.altitude).toBe(computeAltitude(tasks, blips));
  });

  it("never shows the line crossed before that many camps are actually done — Adam's worked example", () => {
    // 2 camps, MAX_ALTITUDE 5000: line 1 at 2500, line 2 (summit) at 5000.
    // Camp 1 has 3 tasks (budget 2500, split 800/800/900); camp 2 has 2
    // tasks (budget 2500, split 1250/1250).
    const tasks = [
      { milestoneId: 1, status: "done" as const, weight: 800, resolvedAt: new Date("2026-01-01") }, // Camp1.Task1
      { milestoneId: 2, status: "done" as const, weight: 1250, resolvedAt: new Date("2026-01-02") }, // Camp2.Task1
      { milestoneId: 1, status: "done" as const, weight: 800, resolvedAt: new Date("2026-01-03") }, // Camp1.Task2
      { milestoneId: 2, status: "done" as const, weight: 1250, resolvedAt: new Date("2026-01-04") }, // Camp2.Task2 — completes camp 2
      { milestoneId: 1, status: "done" as const, weight: 900, resolvedAt: new Date("2026-01-05") }, // Camp1.Task3 — completes camp 1
    ];

    const history = computeAltitudeHistory(tasks, [], 2);

    // Raw progress after 3 events would be 800+1250+800=2850, past line 1 —
    // but neither camp is complete yet, so it's capped at 2500.
    expect(history.map((p) => p.altitude)).toEqual([0, 800, 2050, 2500, 4100, 5000]);
  });
});
