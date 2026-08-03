import { eq, inArray } from "drizzle-orm";
import { db } from "./db/client";
import { blips, milestones, tasks, type Milestone } from "./db/schema";
import { computeAltitude } from "./altitude";
import { altitudeCeiling, campBudget, evenlySpacedAltitudes, isMilestoneComplete, rebalancedPendingWeight } from "./campMath";
import { MAX_ALTITUDE } from "./constants";

/**
 * The displayed/effective altitude: raw earned-minus-lost, capped by how
 * many camps have actually been completed (see lib/campMath.ts's
 * altitudeCeiling) so partial progress spread across several unfinished
 * camps can never visually cross a line before it's earned.
 */
export async function getAltitudeForClimb(climbId: number): Promise<number> {
  const [climbTasks, climbBlips, climbMilestones] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.climbId, climbId)),
    db.select().from(blips).where(eq(blips.climbId, climbId)),
    db.select().from(milestones).where(eq(milestones.climbId, climbId)),
  ]);

  const raw = computeAltitude(climbTasks, climbBlips);
  const completedCount = climbMilestones.filter((m) => m.completedAt !== null).length;
  return Math.min(raw, altitudeCeiling(climbMilestones.length, completedCount));
}

export type AltitudeChangeResult<T> = {
  result: T;
  altitude: number;
};

/**
 * Runs a mutation against a climb's tasks/blips and reports the (capped)
 * altitude afterward.
 */
export async function applyAltitudeChange<T>(
  climbId: number,
  mutate: () => Promise<T>,
): Promise<AltitudeChangeResult<T>> {
  const result = await mutate();
  const altitude = await getAltitudeForClimb(climbId);
  return { result, altitude };
}

export type MilestoneCompletionSync = {
  milestone: Milestone;
  event: "completed" | "uncompleted" | "unchanged";
};

/**
 * Fairly re-shares a milestone's whole budget across every task now in it —
 * done ones included — so a task added to an already-finished milestone
 * doesn't just tack on for free: the old done task's frozen credit shrinks
 * to make room for it, and the altitude visibly drops. Only meaningful when
 * the task count actually changed; if it didn't, this reproduces the exact
 * same split and is a no-op.
 */
async function redistributeMilestoneBudget(milestoneId: number): Promise<void> {
  const [milestone] = await db.select().from(milestones).where(eq(milestones.id, milestoneId));
  if (!milestone) {
    return;
  }

  const milestoneTasks = await db.select().from(tasks).where(eq(tasks.milestoneId, milestoneId));
  if (milestoneTasks.length === 0) {
    return;
  }

  const ordered = [...milestoneTasks].sort((a, b) => a.id - b.id);
  const thresholds = evenlySpacedAltitudes(ordered.length, milestone.budget);

  for (let i = 0; i < ordered.length; i++) {
    const task = ordered[i];
    const weight = campBudget(thresholds, i);
    if (task) {
      await db.update(tasks).set({ weight }).where(eq(tasks.id, task.id));
    }
  }
}

/**
 * Keeps a milestone's completedAt in sync with whether every task in it is
 * actually Done. Called after any task mutation that could change that —
 * completing/deleting a task can newly complete a camp; adding a task or
 * reverting one to pending can newly uncomplete it. Camp order on the
 * mountain is just whichever camps have a completedAt, sorted by it — there
 * is no separate "which position" bookkeeping to maintain here.
 *
 * Reopening a milestone (the "uncompleted" transition) also redistributes
 * its whole budget across every task in it, done ones included — see
 * redistributeMilestoneBudget.
 */
export async function syncMilestoneCompletion(milestoneId: number): Promise<MilestoneCompletionSync> {
  const [milestone] = await db.select().from(milestones).where(eq(milestones.id, milestoneId));
  if (!milestone) {
    throw new Error(`Milestone ${milestoneId} not found`);
  }

  const milestoneTasks = await db.select().from(tasks).where(eq(tasks.milestoneId, milestoneId));
  const shouldBeComplete = isMilestoneComplete(milestoneId, milestoneTasks);
  const isComplete = milestone.completedAt !== null;

  if (shouldBeComplete === isComplete) {
    return { milestone, event: "unchanged" };
  }

  const completedAt = shouldBeComplete ? new Date() : null;
  await db.update(milestones).set({ completedAt }).where(eq(milestones.id, milestoneId));

  if (!shouldBeComplete) {
    await redistributeMilestoneBudget(milestoneId);
  }

  const [updated] = await db.select().from(milestones).where(eq(milestones.id, milestoneId));
  if (!updated) {
    throw new Error(`Milestone ${milestoneId} not found after update`);
  }
  return { milestone: updated, event: shouldBeComplete ? "completed" : "uncompleted" };
}

export type CampCompletionSignal = {
  camp: Milestone | null;
  summit: Milestone | null;
};

/**
 * Recomputes weight for every still-pending task in a camp, based on how
 * much of the camp's (fixed) budget is left after already-done tasks. Done
 * tasks are never touched — they keep whatever they earned.
 */
export async function rebalanceMilestoneTasks(milestoneId: number): Promise<void> {
  const [milestone] = await db.select().from(milestones).where(eq(milestones.id, milestoneId));
  if (!milestone) {
    return;
  }

  const milestoneTasks = await db.select().from(tasks).where(eq(tasks.milestoneId, milestoneId));
  const doneWeightSum = milestoneTasks
    .filter((t) => t.status === "done")
    .reduce((sum, t) => sum + t.weight, 0);
  const pending = milestoneTasks.filter((t) => t.status === "pending");

  if (pending.length === 0) {
    return;
  }

  const weight = rebalancedPendingWeight(milestone.budget, doneWeightSum, pending.length);

  await db
    .update(tasks)
    .set({ weight })
    .where(
      inArray(
        tasks.id,
        pending.map((t) => t.id),
      ),
    );
}

/**
 * Assigns every milestone in a climb its fixed budget and rebalances every
 * one's pending task weights. Needed whenever the number of camps changes,
 * since every slice shifts slightly with the rounding remainder.
 *
 * Camps get their budgets evenly split across MAX_ALTITUDE by id/creation
 * order among themselves (a stable index unrelated to a camp's cosmetic
 * `position` or its earned completion rank) — the summit always takes the
 * final slice, exactly like it's always been.
 */
export async function rebalanceAllCamps(climbId: number): Promise<void> {
  const climbMilestones = await db
    .select()
    .from(milestones)
    .where(eq(milestones.climbId, climbId));

  const camps = climbMilestones.filter((m) => !m.isSummit).sort((a, b) => a.id - b.id);
  const summit = climbMilestones.find((m) => m.isSummit) ?? null;

  const totalSlots = camps.length + (summit ? 1 : 0);
  const thresholds = evenlySpacedAltitudes(totalSlots, MAX_ALTITUDE);

  for (let i = 0; i < camps.length; i++) {
    const camp = camps[i];
    const budget = campBudget(thresholds, i);
    if (camp) {
      await db.update(milestones).set({ budget }).where(eq(milestones.id, camp.id));
    }
  }
  if (summit) {
    await db
      .update(milestones)
      .set({ budget: campBudget(thresholds, camps.length) })
      .where(eq(milestones.id, summit.id));
  }

  for (const milestone of climbMilestones) {
    await rebalanceMilestoneTasks(milestone.id);
  }
}
