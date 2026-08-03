import { describe, expect, it } from "vitest";
import {
  altitudeCeiling,
  campBudget,
  evenlySpacedAltitudes,
  isMilestoneComplete,
  rebalancedPendingWeight,
} from "../../lib/campMath";

describe("evenlySpacedAltitudes", () => {
  it("spaces camps evenly across the max altitude", () => {
    expect(evenlySpacedAltitudes(5, 5000)).toEqual([1000, 2000, 3000, 4000, 5000]);
  });

  it("the last camp always exactly equals the max altitude", () => {
    expect(evenlySpacedAltitudes(3, 5000).at(-1)).toBe(5000);
    expect(evenlySpacedAltitudes(7, 5000).at(-1)).toBe(5000);
  });

  it("returns an empty array for zero or negative camps", () => {
    expect(evenlySpacedAltitudes(0, 5000)).toEqual([]);
    expect(evenlySpacedAltitudes(-1, 5000)).toEqual([]);
  });
});

describe("campBudget", () => {
  it("the first camp's budget runs from zero", () => {
    expect(campBudget([1000, 2000, 3000, 4000, 5000], 0)).toBe(1000);
  });

  it("every other camp's budget runs from the previous camp's threshold", () => {
    expect(campBudget([1000, 2000, 3000, 4000, 5000], 1)).toBe(1000);
    expect(campBudget([1000, 2000, 3000, 4000, 5000], 4)).toBe(1000);
  });

  it("distributes the rounding remainder correctly for camp counts that don't divide evenly", () => {
    // evenlySpacedAltitudes(3, 5000) = [1667, 3333, 5000] — budgets are
    // 1667/1666/1667, not three equal 1666.67s, so the sum is exact.
    const altitudes = evenlySpacedAltitudes(3, 5000);
    const budgets = altitudes.map((_, i) => campBudget(altitudes, i));
    expect(budgets).toEqual([1667, 1666, 1667]);
    expect(budgets.reduce((a, b) => a + b, 0)).toBe(5000);
  });

  it("returns 0 for an out-of-range index", () => {
    expect(campBudget([1000, 2000], 10)).toBe(0);
  });
});

describe("rebalancedPendingWeight", () => {
  it("splits the full budget evenly when nothing is done yet", () => {
    expect(rebalancedPendingWeight(1000, 0, 4)).toBe(250);
  });

  it("splits only the remaining budget after done tasks are subtracted", () => {
    expect(rebalancedPendingWeight(1000, 400, 3)).toBe(200);
  });

  it("never goes negative even if done tasks somehow exceed the budget", () => {
    expect(rebalancedPendingWeight(1000, 1500, 2)).toBe(0);
  });

  it("returns 0 when there are no pending tasks", () => {
    expect(rebalancedPendingWeight(1000, 0, 0)).toBe(0);
  });
});

describe("isMilestoneComplete", () => {
  it("is false for a camp with no tasks at all", () => {
    expect(isMilestoneComplete(1, [])).toBe(false);
  });

  it("is false while any task in the camp is still pending", () => {
    const tasks = [
      { milestoneId: 1, status: "done" },
      { milestoneId: 1, status: "pending" },
    ];
    expect(isMilestoneComplete(1, tasks)).toBe(false);
  });

  it("is true once every task in the camp is done", () => {
    const tasks = [
      { milestoneId: 1, status: "done" },
      { milestoneId: 1, status: "done" },
    ];
    expect(isMilestoneComplete(1, tasks)).toBe(true);
  });

  it("only counts tasks belonging to the given camp", () => {
    const tasks = [
      { milestoneId: 1, status: "done" },
      { milestoneId: 2, status: "pending" },
    ];
    expect(isMilestoneComplete(1, tasks)).toBe(true);
  });
});

describe("altitudeCeiling", () => {
  // Adam's worked example: 2 camps, MAX_ALTITUDE 5000, so line 1 sits at
  // 2500 and line 2 (the summit) at 5000.
  it("caps at line 1 until any camp has completed", () => {
    expect(altitudeCeiling(2, 0)).toBe(2500);
  });

  it("raises the cap to line 2 once exactly one camp has completed", () => {
    expect(altitudeCeiling(2, 1)).toBe(5000);
  });

  it("stays at the max once every camp has completed", () => {
    expect(altitudeCeiling(2, 2)).toBe(5000);
  });

  it("never indexes past the last threshold even if completedCampCount overshoots", () => {
    expect(altitudeCeiling(2, 5)).toBe(5000);
  });

  it("handles camp counts that don't divide evenly, same rounding as evenlySpacedAltitudes", () => {
    // evenlySpacedAltitudes(3, 5000) = [1667, 3333, 5000]
    expect(altitudeCeiling(3, 0)).toBe(1667);
    expect(altitudeCeiling(3, 1)).toBe(3333);
    expect(altitudeCeiling(3, 2)).toBe(5000);
  });

  it("returns 0 for a climb with no camps at all", () => {
    expect(altitudeCeiling(0, 0)).toBe(0);
  });
});
