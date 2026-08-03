"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../lib/db/client";
import { milestones, tasks, type Task } from "../lib/db/schema";
import { requireAuthenticated } from "../lib/auth/session";
import {
  applyAltitudeChange,
  rebalanceMilestoneTasks,
  syncMilestoneCompletion,
  type CampCompletionSignal,
} from "../lib/climb";
import { climbCampsSnapshot, type ClimbCampsSnapshot } from "./milestones";
import { UNDO_WINDOW_SECONDS } from "../lib/constants";

export type AltitudeMutationResult = {
  altitude: number;
};

async function getTaskOrThrow(taskId: number): Promise<Task> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }
  return task;
}

/**
 * Newly completing the summit fires the big celebration; newly completing a
 * regular camp fires the small popup. The summit is a fixed, distinct
 * milestone (see lib/db/schema.ts), so this is a direct flag check — not
 * something inferred from every other camp also being done. Must run
 * *before* altitude is computed (see callers below), since reopening a
 * milestone can redistribute its task weights.
 */
async function completionSignal(milestoneId: number): Promise<CampCompletionSignal> {
  const sync = await syncMilestoneCompletion(milestoneId);
  if (sync.event !== "completed") {
    return { camp: null, summit: null };
  }
  return sync.milestone.isSummit
    ? { camp: null, summit: sync.milestone }
    : { camp: sync.milestone, summit: null };
}

/**
 * Adds a task to a camp. Its weight is a placeholder until the post-insert
 * rebalance divides the camp's remaining budget across however many tasks
 * are now pending in it — which can change every other pending task in the
 * same camp, not just the new one, so this returns the full snapshot rather
 * than just the new task.
 *
 * Adding work to an already-completed camp uncompletes it: completedAt
 * clears, and its whole budget gets fairly re-shared across every task in
 * it (done ones included) — see lib/climb.ts's syncMilestoneCompletion —
 * so the previously-frozen done task's credit shrinks and altitude drops.
 */
export async function addTask(
  milestoneId: number,
  title: string,
): Promise<{ altitude: number } & ClimbCampsSnapshot> {
  await requireAuthenticated();

  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error("Task title cannot be empty");
  }

  const [milestone] = await db.select().from(milestones).where(eq(milestones.id, milestoneId));
  if (!milestone) {
    throw new Error(`Milestone ${milestoneId} not found`);
  }

  const { altitude } = await applyAltitudeChange(milestone.climbId, async () => {
    const [task] = await db
      .insert(tasks)
      .values({ climbId: milestone.climbId, milestoneId, title: trimmed, weight: 0 })
      .returning();

    if (!task) {
      throw new Error("Failed to create task");
    }

    await rebalanceMilestoneTasks(milestoneId);
    await syncMilestoneCompletion(milestoneId);
  });

  revalidatePath("/");
  const snapshot = await climbCampsSnapshot(milestone.climbId);
  return { altitude, ...snapshot };
}

export async function completeTask(
  taskId: number,
): Promise<{ task: Task } & AltitudeMutationResult & CampCompletionSignal> {
  await requireAuthenticated();
  const task = await getTaskOrThrow(taskId);

  const { result, altitude } = await applyAltitudeChange(task.climbId, async () => {
    await db
      .update(tasks)
      .set({ status: "done", resolvedAt: new Date() })
      .where(eq(tasks.id, taskId));
    await rebalanceMilestoneTasks(task.milestoneId);
    return completionSignal(task.milestoneId);
  });

  const updated = await getTaskOrThrow(taskId);
  revalidatePath("/");
  return { task: updated, altitude, camp: result.camp, summit: result.summit };
}

export type UndoResult =
  | ({ ok: true; task: Task } & AltitudeMutationResult)
  | { ok: false; reason: "not-resolved" | "window-expired" };

export async function undoTaskStatus(taskId: number): Promise<UndoResult> {
  await requireAuthenticated();
  const task = await getTaskOrThrow(taskId);

  if (task.status === "pending" || !task.resolvedAt) {
    return { ok: false, reason: "not-resolved" };
  }

  const elapsedSeconds = (Date.now() - task.resolvedAt.getTime()) / 1000;
  if (elapsedSeconds > UNDO_WINDOW_SECONDS) {
    return { ok: false, reason: "window-expired" };
  }

  // Undo always puts the task back to pending, so it can only ever
  // uncomplete a camp, never complete one — no popup signal needed.
  const { altitude } = await applyAltitudeChange(task.climbId, async () => {
    await db
      .update(tasks)
      .set({ status: "pending", resolvedAt: null })
      .where(eq(tasks.id, taskId));
    await rebalanceMilestoneTasks(task.milestoneId);
    await syncMilestoneCompletion(task.milestoneId);
  });

  const updated = await getTaskOrThrow(taskId);
  revalidatePath("/");
  return { ok: true, task: updated, altitude };
}

/**
 * History's "Undo" — reverts a resolved task back to pending regardless of
 * how long ago it resolved (unlike undoTaskStatus's time-limited toast). If
 * its camp had already claimed a mountain line, this drops it back out of
 * the completion ranking and redistributes its budget — every other camp's
 * rank simply shifts since rank is always derived fresh from completedAt,
 * nothing to reposition. Returns the full snapshot since rebalancing can
 * touch every other pending task's weight.
 */
export async function restoreTaskFromHistory(
  taskId: number,
): Promise<{ altitude: number } & ClimbCampsSnapshot> {
  await requireAuthenticated();
  const task = await getTaskOrThrow(taskId);

  if (task.status === "pending") {
    throw new Error("This task is already pending.");
  }

  const { altitude } = await applyAltitudeChange(task.climbId, async () => {
    await db.update(tasks).set({ status: "pending", resolvedAt: null }).where(eq(tasks.id, taskId));
    await rebalanceMilestoneTasks(task.milestoneId);
    await syncMilestoneCompletion(task.milestoneId);
  });

  revalidatePath("/");
  const snapshot = await climbCampsSnapshot(task.climbId);
  return { altitude, ...snapshot };
}

export type EditTaskFields = Partial<{
  title: string;
}>;

export async function editTask(taskId: number, fields: EditTaskFields): Promise<Task> {
  await requireAuthenticated();
  await getTaskOrThrow(taskId);

  const updates: EditTaskFields = {};
  if (fields.title !== undefined) {
    const trimmed = fields.title.trim();
    if (!trimmed) {
      throw new Error("Task title cannot be empty");
    }
    updates.title = trimmed;
  }

  await db.update(tasks).set(updates).where(eq(tasks.id, taskId));

  revalidatePath("/");
  return getTaskOrThrow(taskId);
}

/**
 * Deleting the one pending task holding a camp back can complete it — e.g.
 * Adam decides he doesn't want a task rather than marking it missed — so
 * this needs the same completion signal as completeTask.
 */
export async function deleteTask(
  taskId: number,
): Promise<{ altitude: number } & CampCompletionSignal> {
  await requireAuthenticated();
  const existing = await getTaskOrThrow(taskId);

  const { result, altitude } = await applyAltitudeChange(existing.climbId, async () => {
    await db.delete(tasks).where(eq(tasks.id, taskId));
    // Removing a done task frees up budget for its still-pending siblings;
    // removing a pending one just shrinks the pending count. Either way,
    // whatever's left needs rebalancing.
    await rebalanceMilestoneTasks(existing.milestoneId);
    return completionSignal(existing.milestoneId);
  });

  revalidatePath("/");
  return { altitude, camp: result.camp, summit: result.summit };
}
