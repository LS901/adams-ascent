import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../lib/db/client";
import { climbs, milestones, tasks, type Task } from "../../lib/db/schema";
import {
  addTask,
  completeTask,
  deleteTask,
  editTask,
  restoreTaskFromHistory,
  undoTaskStatus,
} from "../../actions/tasks";
import { logBlip } from "../../actions/blips";
import { createSession } from "../../lib/auth/session";
import { MAX_ALTITUDE } from "../../lib/constants";
import { campBudget, evenlySpacedAltitudes } from "../../lib/campMath";

let climbId: number;
let campAId: number; // budget 2500 (half of 5000, two camps)
let campBId: number; // also budget 2500

/**
 * addTask returns the full climb snapshot (adding a task can rebalance
 * every pending sibling in the camp, or uncomplete an already-completed
 * one) — this pulls the just-created task back out for tests that only
 * care about the one row.
 */
async function addTaskAndGet(milestoneId: number, title: string): Promise<Task> {
  const snapshot = await addTask(milestoneId, title);
  const task = snapshot.tasks.find((t) => t.milestoneId === milestoneId && t.title === title.trim());
  if (!task) throw new Error(`task "${title}" not found in milestone ${milestoneId}`);
  return task;
}

beforeEach(async () => {
  await createSession();
  const [climb] = await db.insert(climbs).values({ title: "Test Climb" }).returning();
  if (!climb) throw new Error("setup failed");
  climbId = climb.id;

  const thresholds = evenlySpacedAltitudes(2, MAX_ALTITUDE);
  const [campA] = await db
    .insert(milestones)
    .values({ climbId, title: "Camp A", position: 0, budget: campBudget(thresholds, 0) })
    .returning();
  const [campB] = await db
    .insert(milestones)
    .values({ climbId, title: "Camp B", position: 1, budget: campBudget(thresholds, 1) })
    .returning();
  if (!campA || !campB) throw new Error("setup failed");
  campAId = campA.id;
  campBId = campB.id;
});

describe("addTask", () => {
  it("creates a pending task and gives it the camp's full budget as its weight", async () => {
    const task = await addTaskAndGet(campAId, "Read chapter 1");
    expect(task.status).toBe("pending");
    expect(task.title).toBe("Read chapter 1");
    expect(task.weight).toBe(2500);
  });

  it("splits the camp's budget evenly when multiple tasks share it", async () => {
    await addTaskAndGet(campAId, "Task 1");
    const second = await addTaskAndGet(campAId, "Task 2");
    expect(second.weight).toBe(1250); // 2500 / 2

    const all = await db.select().from(tasks).where(eq(tasks.milestoneId, campAId));
    for (const t of all) {
      expect(t.weight).toBe(1250);
    }
  });

  it("trims whitespace and rejects empty titles", async () => {
    const task = await addTaskAndGet(campAId, "  Spaced  ");
    expect(task.title).toBe("Spaced");
    await expect(addTask(campAId, "   ")).rejects.toThrow();
  });

  it("reports the newly added task's sibling weights via the snapshot", async () => {
    await addTaskAndGet(campAId, "Task 1"); // alone, worth 2500
    const snapshot = await addTask(campAId, "Task 2"); // now split, both worth 1250
    const campATasks = snapshot.tasks.filter((t) => t.milestoneId === campAId);
    expect(campATasks.map((t) => t.weight)).toEqual([1250, 1250]);
  });

  it("uncompletes an already-completed camp when new work is added to it", async () => {
    const task = await addTaskAndGet(campAId, "Only task");
    await completeTask(task.id);
    const [beforeAdd] = await db.select().from(milestones).where(eq(milestones.id, campAId));
    expect(beforeAdd?.completedAt).not.toBeNull();

    const snapshot = await addTask(campAId, "Follow-up");
    const reopened = snapshot.milestones.find((m) => m.id === campAId);
    expect(reopened?.completedAt).toBeNull();
  });

  it("redistributes the whole budget across every task, done ones included, when reopening a completed camp — altitude drops", async () => {
    const original = await addTaskAndGet(campAId, "Only task");
    const completed = await completeTask(original.id);
    expect(completed.altitude).toBe(2500); // camp A's full budget, solo task

    const snapshot = await addTask(campAId, "Follow-up");
    // Camp A's 2500 budget is now shared by 2 tasks — the old done one's
    // frozen credit shrinks to make room for the new one.
    const campATasks = snapshot.tasks.filter((t) => t.milestoneId === campAId);
    expect(campATasks.map((t) => t.weight).sort((a, b) => a - b)).toEqual([1250, 1250]);
    expect(snapshot.altitude).toBe(1250); // only the still-done task counts now
  });
});

describe("completeTask", () => {
  it("increases altitude by the task's weight", async () => {
    const task = await addTaskAndGet(campAId, "Do a workout");
    const result = await completeTask(task.id);
    expect(result.altitude).toBe(2500);
  });

  it("rebalances remaining pending siblings after one completes", async () => {
    const first = await addTaskAndGet(campAId, "Task 1");
    const second = await addTaskAndGet(campAId, "Task 2"); // both now 1250 each
    await completeTask(first.id);

    const [reloaded] = await db.select().from(tasks).where(eq(tasks.id, second.id));
    // Only one pending task left, budget fully returns to it.
    expect(reloaded?.weight).toBe(1250);
  });

  it("caps the returned altitude below line 1 until a camp is fully done", async () => {
    const a1 = await addTaskAndGet(campAId, "A1");
    await addTaskAndGet(campAId, "A2"); // camp A now 2 pending tasks, 1250 each
    const result = await completeTask(a1.id); // 1 of 2 done — camp A not complete yet
    expect(result.camp).toBeNull();
    expect(result.altitude).toBe(1250);
  });

  it("returns the completed camp for the popup regardless of completion order", async () => {
    const taskA = await addTaskAndGet(campAId, "Task A");
    const resultA = await completeTask(taskA.id);
    expect(resultA.camp?.id).toBe(campAId);
    expect(resultA.summit).toBeNull();

    const taskB = await addTaskAndGet(campBId, "Task B");
    const resultB = await completeTask(taskB.id);
    expect(resultB.camp?.id).toBe(campBId);
    expect(resultB.summit).toBeNull();
  });

  it("returns the summit (not a camp) when the summit's own tasks complete", async () => {
    // The summit is a distinct, fixed milestone — completing it fires the
    // big celebration regardless of whether any camps are done yet.
    const [summit] = await db
      .insert(milestones)
      .values({ climbId, title: "Summit", position: 2, budget: 1000, isSummit: true })
      .returning();
    if (!summit) throw new Error("setup failed");

    const summitTask = await addTaskAndGet(summit.id, "Reach the top");
    const result = await completeTask(summitTask.id);
    expect(result.camp).toBeNull();
    expect(result.summit?.id).toBe(summit.id);
  });

  it("still completes a camp even when a blip keeps overall altitude below the camp's own budget", async () => {
    // Altitude is climb-wide, so this blip's -25 has nothing to do with camp
    // A specifically — but it's enough to keep altitude below camp A's 2500
    // budget even once its only task is done. Completion is keyed off task
    // status, not the altitude number, so it isn't affected.
    await logBlip(climbId);
    const task = await addTaskAndGet(campAId, "Solo task");
    const result = await completeTask(task.id);
    expect(result.altitude).toBe(2500 - 25);
    expect(result.camp?.id).toBe(campAId);
  });
});

describe("undoTaskStatus", () => {
  it("reverts a just-completed task back to pending and recalculates altitude", async () => {
    const task = await addTaskAndGet(campAId, "Oops");
    await completeTask(task.id);

    const undone = await undoTaskStatus(task.id);
    expect(undone.ok).toBe(true);
    if (undone.ok) {
      expect(undone.altitude).toBe(0);
    }

    const [reloaded] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    expect(reloaded?.status).toBe("pending");
    expect(reloaded?.resolvedAt).toBeNull();
  });

  it("refuses to undo a task that's still pending", async () => {
    const task = await addTaskAndGet(campAId, "Untouched");
    const result = await undoTaskStatus(task.id);
    expect(result).toEqual({ ok: false, reason: "not-resolved" });
  });
});

describe("restoreTaskFromHistory", () => {
  it("un-resolves a task and recalculates altitude", async () => {
    const task = await addTaskAndGet(campAId, "Oops");
    await completeTask(task.id);

    const snapshot = await restoreTaskFromHistory(task.id);
    expect(snapshot.altitude).toBe(0);

    const restored = snapshot.tasks.find((t) => t.id === task.id);
    expect(restored?.status).toBe("pending");
    expect(restored?.resolvedAt).toBeNull();
  });

  it("uncompletes a camp that had already claimed a mountain line", async () => {
    const task = await addTaskAndGet(campAId, "Only task");
    await completeTask(task.id);
    const [beforeRestore] = await db.select().from(milestones).where(eq(milestones.id, campAId));
    expect(beforeRestore?.completedAt).not.toBeNull();

    const snapshot = await restoreTaskFromHistory(task.id);
    const campA = snapshot.milestones.find((m) => m.id === campAId);
    expect(campA?.completedAt).toBeNull();
  });

  it("does not affect a camp that was never completed", async () => {
    const first = await addTaskAndGet(campAId, "Task 1");
    await addTaskAndGet(campAId, "Task 2");
    await completeTask(first.id); // camp A still has one pending, never completed

    const snapshot = await restoreTaskFromHistory(first.id);
    const campA = snapshot.milestones.find((m) => m.id === campAId);
    expect(campA?.completedAt).toBeNull();
  });

  it("refuses to restore a task that's already pending", async () => {
    const task = await addTaskAndGet(campAId, "Untouched");
    await expect(restoreTaskFromHistory(task.id)).rejects.toThrow();
  });
});

describe("editTask", () => {
  it("updates only the title", async () => {
    const task = await addTaskAndGet(campAId, "Original");
    const updated = await editTask(task.id, { title: "Renamed" });
    expect(updated.title).toBe("Renamed");
    expect(updated.weight).toBe(task.weight);
  });
});

describe("deleteTask", () => {
  it("removes the task and recalculates altitude", async () => {
    const task = await addTaskAndGet(campAId, "Doomed");
    await completeTask(task.id);
    const { altitude } = await deleteTask(task.id);
    expect(altitude).toBe(0);

    const remaining = await db.select().from(tasks).where(eq(tasks.milestoneId, campAId));
    expect(remaining).toHaveLength(0);
  });

  it("frees up budget for remaining pending siblings when a done task is deleted", async () => {
    const first = await addTaskAndGet(campAId, "Task 1");
    const second = await addTaskAndGet(campAId, "Task 2");
    await completeTask(first.id); // both were 1250; first banks 1250

    await deleteTask(first.id);

    const [reloaded] = await db.select().from(tasks).where(eq(tasks.id, second.id));
    expect(reloaded?.weight).toBe(2500); // full budget back, only one pending task left
  });

  it("completes a camp when deleting the one pending task that was holding it back", async () => {
    const done = await addTaskAndGet(campAId, "Keep");
    const toDelete = await addTaskAndGet(campAId, "Don't want this one");
    await completeTask(done.id);
    // Camp A has one done, one pending — not complete yet.

    const result = await deleteTask(toDelete.id);
    expect(result.camp?.id).toBe(campAId);
  });
});
