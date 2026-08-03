"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../lib/db/client";
import { blips, climbs, milestones, tasks, type Climb, type Milestone } from "../lib/db/schema";
import { requireAuthenticated } from "../lib/auth/session";
import { getAltitudeForClimb, rebalanceAllCamps } from "../lib/climb";
import { DEFAULT_MILESTONE_TITLES } from "../lib/constants";

async function getClimbOrThrow(climbId: number): Promise<Climb> {
  const [climb] = await db.select().from(climbs).where(eq(climbs.id, climbId));
  if (!climb) {
    throw new Error(`Climb ${climbId} not found`);
  }
  return climb;
}

/**
 * Ends the active climb's journey outright — the "Descend" choice at the
 * summit, with no next mountain queued up.
 */
export async function completeClimb(climbId: number): Promise<Climb> {
  await requireAuthenticated();
  await getClimbOrThrow(climbId);

  await db
    .update(climbs)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(climbs.id, climbId));

  revalidatePath("/");
  return getClimbOrThrow(climbId);
}

/**
 * Starts a fresh climb. When called with the id of a climb that's still
 * 'active' (the "Keep going" choice at a summit), that previous climb is
 * marked 'descended' first. Called with no previous climb — or one that's
 * already 'completed'/'descended' — it just starts a new journey from an
 * idle state without touching that old, already-terminal record.
 */
export async function startNewClimb(title: string, previousClimbId?: number): Promise<Climb> {
  await requireAuthenticated();

  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    throw new Error("Climb title cannot be empty");
  }

  if (previousClimbId !== undefined) {
    const previous = await getClimbOrThrow(previousClimbId);
    if (previous.status === "active") {
      await db
        .update(climbs)
        .set({ status: "descended", completedAt: new Date() })
        .where(eq(climbs.id, previousClimbId));
    }
  }

  const [climb] = await db
    .insert(climbs)
    .values({ title: trimmedTitle, status: "active", onboardingComplete: false })
    .returning();

  if (!climb) {
    throw new Error("Failed to create climb");
  }

  // The last default title ("Summit: first client") is the fixed summit;
  // everything before it is a regular, freely reorderable camp.
  const campTitles = DEFAULT_MILESTONE_TITLES.slice(0, -1);
  const summitTitle = DEFAULT_MILESTONE_TITLES.at(-1) ?? "Summit";

  await db.insert(milestones).values(
    campTitles.map((title, position) => ({
      climbId: climb.id,
      title,
      position,
      budget: 0,
    })),
  );
  await db.insert(milestones).values({
    climbId: climb.id,
    title: summitTitle,
    position: campTitles.length,
    budget: 0,
    isSummit: true,
  });
  await rebalanceAllCamps(climb.id);

  revalidatePath("/");
  return climb;
}

/**
 * Records Adam's own reward text on the climb's summit once he's typed it
 * into the big celebration modal. The summit is a fixed, distinct
 * milestone — always exactly one per climb — so it's found directly rather
 * than needing the caller to pass its id.
 */
export async function recordSummitReward(climbId: number, reward: string): Promise<Milestone> {
  await requireAuthenticated();
  await getClimbOrThrow(climbId);

  const trimmed = reward.trim();
  if (!trimmed) {
    throw new Error("Summit reward cannot be empty");
  }

  const [summit] = await db
    .select()
    .from(milestones)
    .where(and(eq(milestones.climbId, climbId), eq(milestones.isSummit, true)));
  if (!summit) {
    throw new Error(`No summit milestone found for climb ${climbId}`);
  }

  await db.update(milestones).set({ reward: trimmed }).where(eq(milestones.id, summit.id));

  revalidatePath("/");

  const [updated] = await db.select().from(milestones).where(eq(milestones.id, summit.id));
  if (!updated) {
    throw new Error("Failed to update summit milestone");
  }
  return updated;
}

/**
 * Marks the summit reached directly, regardless of whether it has any
 * tasks — the final goal doesn't necessarily need app-tracked tasks (e.g.
 * "reach 75kg" might already be true by the time every camp is done).
 * Locked until every camp has been completed.
 */
export async function reachSummit(climbId: number): Promise<{ altitude: number; summit: Milestone }> {
  await requireAuthenticated();
  await getClimbOrThrow(climbId);

  const climbMilestones = await db.select().from(milestones).where(eq(milestones.climbId, climbId));
  const summit = climbMilestones.find((m) => m.isSummit);
  if (!summit) {
    throw new Error(`No summit milestone found for climb ${climbId}`);
  }
  if (summit.completedAt !== null) {
    throw new Error("The summit has already been reached.");
  }

  const camps = climbMilestones.filter((m) => !m.isSummit);
  if (!camps.every((m) => m.completedAt !== null)) {
    throw new Error("Finish every camp before reaching the summit.");
  }

  await db.update(milestones).set({ completedAt: new Date() }).where(eq(milestones.id, summit.id));

  revalidatePath("/");
  const altitude = await getAltitudeForClimb(climbId);
  const [updated] = await db.select().from(milestones).where(eq(milestones.id, summit.id));
  if (!updated) {
    throw new Error("Failed to update summit milestone");
  }
  return { altitude, summit: updated };
}

export type OnboardingMilestoneInput = {
  title: string;
  reward?: string;
};

export type OnboardingTaskInput = {
  title: string;
  /** Index into [...camps, summit] this task belongs to. */
  campIndex: number;
};

/**
 * Finalizes the onboarding wizard: replaces whatever milestones existed for
 * this climb with the (possibly edited) final camps plus a separate,
 * mandatory summit, adds the first tasks under whichever one each was
 * assigned to, and marks onboarding done. Budgets and task weights are
 * derived afterward by rebalanceAllCamps.
 */
export async function completeOnboarding(
  climbId: number,
  milestonesInput: OnboardingMilestoneInput[],
  summitInput: OnboardingMilestoneInput,
  tasksInput: OnboardingTaskInput[],
): Promise<void> {
  await requireAuthenticated();
  await getClimbOrThrow(climbId);

  const validMilestones = milestonesInput.filter((m) => m.title.trim().length > 0);
  const summitTitle = summitInput.title.trim();
  if (!summitTitle) {
    throw new Error("The summit needs a name");
  }

  await db.delete(tasks).where(eq(tasks.climbId, climbId));
  await db.delete(milestones).where(eq(milestones.climbId, climbId));

  const insertedCamps =
    validMilestones.length > 0
      ? await db
          .insert(milestones)
          .values(
            validMilestones.map((m, position) => ({
              climbId,
              title: m.title.trim(),
              position,
              budget: 0,
              reward: m.reward?.trim() || null,
            })),
          )
          .returning()
      : [];

  const [insertedSummit] = await db
    .insert(milestones)
    .values({
      climbId,
      title: summitTitle,
      position: insertedCamps.length,
      budget: 0,
      reward: summitInput.reward?.trim() || null,
      isSummit: true,
    })
    .returning();

  if (!insertedSummit) {
    throw new Error("Failed to create summit milestone");
  }

  const allMilestones = [...insertedCamps, insertedSummit];

  const validTasks = tasksInput.filter((t) => t.title.trim().length > 0);
  if (validTasks.length > 0) {
    const taskRows = validTasks
      .map((t) => {
        const milestone = allMilestones[t.campIndex];
        if (!milestone) {
          return null;
        }
        return {
          climbId,
          milestoneId: milestone.id,
          title: t.title.trim(),
          weight: 0,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    if (taskRows.length > 0) {
      await db.insert(tasks).values(taskRows);
    }
  }

  await rebalanceAllCamps(climbId);
  await db.update(climbs).set({ onboardingComplete: true }).where(eq(climbs.id, climbId));
  revalidatePath("/");
}

/**
 * Wipes every climb, camp, task, and blip — a full reset back to a clean
 * slate. There's only ever one user, so this is a blunt "start over"
 * rather than a scoped per-climb delete.
 */
export async function resetAllData(): Promise<void> {
  await requireAuthenticated();

  await db.delete(blips);
  await db.delete(tasks);
  await db.delete(milestones);
  await db.delete(climbs);

  revalidatePath("/");
}
