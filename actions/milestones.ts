"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../lib/db/client";
import { milestones, tasks, type Milestone, type Task } from "../lib/db/schema";
import { requireAuthenticated } from "../lib/auth/session";
import { rebalanceAllCamps } from "../lib/climb";

async function getMilestoneOrThrow(milestoneId: number): Promise<Milestone> {
  const [milestone] = await db.select().from(milestones).where(eq(milestones.id, milestoneId));
  if (!milestone) {
    throw new Error(`Milestone ${milestoneId} not found`);
  }
  return milestone;
}

/**
 * Adding or removing a camp re-spaces every camp's budget and rebalances
 * every camp's pending task weights — so callers always get the full fresh
 * state back rather than just the one row they touched, which would
 * otherwise leave the client holding stale weights.
 */
export type ClimbCampsSnapshot = {
  milestones: Milestone[];
  tasks: Task[];
};

export async function climbCampsSnapshot(climbId: number): Promise<ClimbCampsSnapshot> {
  const [climbMilestones, climbTasks] = await Promise.all([
    db.select().from(milestones).where(eq(milestones.climbId, climbId)),
    db.select().from(tasks).where(eq(tasks.climbId, climbId)),
  ]);
  return { milestones: climbMilestones, tasks: climbTasks };
}

/**
 * Adds a new camp, appended at the end of the cosmetic display order among
 * camps. Always a regular camp — the summit is a separate, fixed milestone
 * created once per climb (see actions/climbs.ts) and never added this way.
 */
export async function addMilestone(
  climbId: number,
  title: string,
  reward?: string,
): Promise<ClimbCampsSnapshot> {
  await requireAuthenticated();

  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error("Milestone title cannot be empty");
  }

  const siblingCamps = await db
    .select()
    .from(milestones)
    .where(and(eq(milestones.climbId, climbId), eq(milestones.isSummit, false)));
  const position = siblingCamps.length;

  await db
    .insert(milestones)
    .values({ climbId, title: trimmed, position, budget: 0, reward: reward?.trim() || null });

  await rebalanceAllCamps(climbId);
  revalidatePath("/");
  return climbCampsSnapshot(climbId);
}

export type EditMilestoneFields = Partial<{
  title: string;
  reward: string | null;
}>;

export async function editMilestone(
  milestoneId: number,
  fields: EditMilestoneFields,
): Promise<Milestone> {
  await requireAuthenticated();
  await getMilestoneOrThrow(milestoneId);

  const updates: EditMilestoneFields = {};
  if (fields.title !== undefined) {
    const trimmed = fields.title.trim();
    if (!trimmed) {
      throw new Error("Milestone title cannot be empty");
    }
    updates.title = trimmed;
  }
  if (fields.reward !== undefined) {
    updates.reward = fields.reward?.trim() || null;
  }

  await db.update(milestones).set(updates).where(eq(milestones.id, milestoneId));

  revalidatePath("/");
  return getMilestoneOrThrow(milestoneId);
}

/**
 * The summit can never be deleted — every climb needs a final goal. A camp
 * with any tasks (done or pending) can't be deleted either — delete or move
 * them first.
 */
export async function deleteMilestone(milestoneId: number): Promise<ClimbCampsSnapshot> {
  await requireAuthenticated();
  const milestone = await getMilestoneOrThrow(milestoneId);

  if (milestone.isSummit) {
    throw new Error("The summit can't be removed — every climb needs one final goal.");
  }

  const remainingTasks = await db.select().from(tasks).where(eq(tasks.milestoneId, milestoneId));
  if (remainingTasks.length > 0) {
    throw new Error("This camp still has tasks assigned to it — delete or move them first.");
  }

  await db.delete(milestones).where(eq(milestones.id, milestoneId));
  await rebalanceAllCamps(milestone.climbId);
  revalidatePath("/");
  return climbCampsSnapshot(milestone.climbId);
}

/**
 * Reorders camps for a climb to match the given id sequence. Purely
 * cosmetic — Adam's intended working order in the Camps list and dashboard
 * tabs — with no effect on budgets or which mountain line a camp claims.
 * The summit is never part of this: any summit id slipped into the input is
 * dropped rather than repositioned, since it's never reordered.
 */
export async function reorderMilestones(
  climbId: number,
  orderedMilestoneIds: number[],
): Promise<ClimbCampsSnapshot> {
  await requireAuthenticated();

  const siblings = await db.select().from(milestones).where(eq(milestones.climbId, climbId));
  const campIds = new Set(siblings.filter((m) => !m.isSummit).map((m) => m.id));
  const campOrder = orderedMilestoneIds.filter((id) => campIds.has(id));

  for (let position = 0; position < campOrder.length; position++) {
    const milestoneId = campOrder[position];
    if (milestoneId !== undefined) {
      await db.update(milestones).set({ position }).where(eq(milestones.id, milestoneId));
    }
  }

  revalidatePath("/");
  return climbCampsSnapshot(climbId);
}
