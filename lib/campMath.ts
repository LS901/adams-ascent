/**
 * Camps are always evenly spaced across the fixed max altitude by count —
 * no manual altitude entry. Each camp's "budget" (its fixed slice of
 * MAX_ALTITUDE) is split evenly across its own pending tasks, so completing
 * every task in a camp earns exactly that camp's budget.
 */

import { MAX_ALTITUDE } from "./constants";

export function evenlySpacedAltitudes(count: number, maxAltitude: number): number[] {
  if (count <= 0) {
    return [];
  }
  return Array.from({ length: count }, (_, i) => Math.round(((i + 1) / count) * maxAltitude));
}

/**
 * The altitude slice a single camp is worth, given every camp's threshold
 * (already rounded, sorted ascending) and the camp's stable index. This must
 * be derived from the actual rounded thresholds, not naively as
 * maxAltitude/count — rounding each threshold independently means the
 * remainder gets distributed across camps (e.g. 5000 over 3 camps is
 * [1667, 3333, 5000], i.e. budgets of 1667/1666/1667, not three equal
 * 1666.67s) and task weights must add up to exactly those budgets.
 *
 * The "index" here is a camp's position in a stable, arbitrary ordering —
 * see lib/climb.ts's rebalanceAllCamps, which uses id (creation) order, not
 * the camp's cosmetic `position` or its earned completion rank. A camp's
 * budget must be knowable while it's still in progress, long before its
 * completion rank exists.
 */
export function campBudget(sortedAltitudes: readonly number[], index: number): number {
  const current = sortedAltitudes[index];
  if (current === undefined) {
    return 0;
  }
  const previous = index === 0 ? 0 : (sortedAltitudes[index - 1] ?? 0);
  return current - previous;
}

/**
 * How much altitude each still-pending task in a camp should be worth right
 * now: whatever's left of the camp's budget after already-done tasks,
 * split evenly across however many tasks are still pending. Recalculated
 * live — done tasks keep whatever they already earned.
 */
export function rebalancedPendingWeight(
  budget: number,
  doneWeightSum: number,
  pendingCount: number,
): number {
  if (pendingCount <= 0) {
    return 0;
  }
  const remaining = Math.max(0, budget - doneWeightSum);
  return Math.round(remaining / pendingCount);
}

/**
 * How high the displayed/effective altitude is allowed to rise given how
 * many camps have actually been completed so far — regardless of how much
 * raw progress has piled up across still-unfinished camps. Camp order on
 * the mountain is earned by completion, so the display can't cross the
 * (completedCampCount + 1)-th line until that many camps are actually done:
 * with 0 camps done, it can approach but not pass line 1; with 1 done, line
 * 2; and so on, until every camp is done and the ceiling is MAX_ALTITUDE.
 */
export function altitudeCeiling(totalCampCount: number, completedCampCount: number): number {
  if (totalCampCount <= 0) {
    return 0;
  }
  const thresholds = evenlySpacedAltitudes(totalCampCount, MAX_ALTITUDE);
  const index = Math.min(completedCampCount, totalCampCount - 1);
  return thresholds[index] ?? 0;
}

/**
 * A camp is "done" once every task ever added to it is marked Done — an
 * empty camp doesn't count, so it stays open for work rather than reading
 * as already complete. There's no partial credit: a task you don't want is
 * deleted, not marked missed.
 */
export function isMilestoneComplete<T extends { milestoneId: number; status: string }>(
  milestoneId: number,
  tasks: readonly T[],
): boolean {
  const campTasks = tasks.filter((t) => t.milestoneId === milestoneId);
  return campTasks.length > 0 && campTasks.every((t) => t.status === "done");
}
