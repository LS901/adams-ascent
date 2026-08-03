import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../lib/db/client";
import { climbs, milestones } from "../../lib/db/schema";
import { addMilestone, deleteMilestone, editMilestone, reorderMilestones } from "../../actions/milestones";
import { addTask, completeTask } from "../../actions/tasks";
import { createSession } from "../../lib/auth/session";
import { MAX_ALTITUDE } from "../../lib/constants";
import { campBudget, evenlySpacedAltitudes } from "../../lib/campMath";

let climbId: number;

beforeEach(async () => {
  await createSession();
  const [climb] = await db.insert(climbs).values({ title: "Test Climb" }).returning();
  if (!climb) throw new Error("setup failed");
  climbId = climb.id;
});

describe("addMilestone", () => {
  it("the first camp added to an empty climb gets the full budget", async () => {
    const first = await addMilestone(climbId, "Camp 1");
    expect(first.milestones).toHaveLength(1);
    expect(first.milestones[0]?.budget).toBe(MAX_ALTITUDE);
  });

  it("appends new camps at the end of the cosmetic position order", async () => {
    await addMilestone(climbId, "Camp 1");
    const { milestones } = await addMilestone(climbId, "Camp 2");
    const sorted = [...milestones].sort((a, b) => a.position - b.position);
    expect(sorted.map((m) => m.title)).toEqual(["Camp 1", "Camp 2"]);
  });

  it("re-splits every camp's budget by creation (id) order as camps are added", async () => {
    const first = await addMilestone(climbId, "Camp 1");
    const campOneId = first.milestones[0]?.id;
    if (!campOneId) throw new Error("setup failed");

    const withSecond = await addMilestone(climbId, "Camp 2");
    const sortedTwo = [...withSecond.milestones].sort((a, b) => a.id - b.id);
    expect(sortedTwo.map((m) => m.budget)).toEqual([MAX_ALTITUDE / 2, MAX_ALTITUDE / 2]);

    const withThird = await addMilestone(climbId, "Camp 3", "Coffee");
    const sortedThree = [...withThird.milestones].sort((a, b) => a.id - b.id);
    expect(sortedThree.map((m) => m.title)).toEqual(["Camp 1", "Camp 2", "Camp 3"]);
    expect(sortedThree[2]?.reward).toBe("Coffee");
    const thresholds = evenlySpacedAltitudes(3, MAX_ALTITUDE);
    expect(sortedThree.map((m) => m.budget)).toEqual([
      campBudget(thresholds, 0),
      campBudget(thresholds, 1),
      campBudget(thresholds, 2),
    ]);
  });

  it("rejects an empty title", async () => {
    await expect(addMilestone(climbId, "   ")).rejects.toThrow();
  });
});

describe("editMilestone", () => {
  it("updates title and reward without touching budget", async () => {
    const { milestones: created } = await addMilestone(climbId, "Original");
    const milestone = created[0];
    if (!milestone) throw new Error("setup failed");

    const updated = await editMilestone(milestone.id, { title: "Renamed", reward: "New shoes" });
    expect(updated.title).toBe("Renamed");
    expect(updated.reward).toBe("New shoes");
    expect(updated.budget).toBe(milestone.budget);
  });
});

describe("deleteMilestone", () => {
  it("removes the milestone and re-splits the remaining ones' budgets", async () => {
    await addMilestone(climbId, "Camp 1");
    const { milestones: afterSecond } = await addMilestone(climbId, "Camp 2");
    const toDelete = afterSecond.find((m) => m.title === "Camp 1");
    if (!toDelete) throw new Error("setup failed");

    const snapshot = await deleteMilestone(toDelete.id);
    expect(snapshot.milestones).toHaveLength(1);
    expect(snapshot.milestones[0]?.budget).toBe(MAX_ALTITUDE);
  });

  it("refuses to delete a camp that still has pending tasks", async () => {
    const { milestones: created } = await addMilestone(climbId, "Camp with tasks");
    const milestone = created.find((m) => m.title === "Camp with tasks");
    if (!milestone) throw new Error("setup failed");
    await addTask(milestone.id, "A task");

    await expect(deleteMilestone(milestone.id)).rejects.toThrow();
  });

  it("refuses to delete a camp that has already completed — it still has tasks", async () => {
    const { milestones: created } = await addMilestone(climbId, "Camp with history");
    const milestone = created[0];
    if (!milestone) throw new Error("setup failed");
    const snapshot = await addTask(milestone.id, "Only task");
    const task = snapshot.tasks[0];
    if (!task) throw new Error("setup failed");
    await completeTask(task.id);

    await expect(deleteMilestone(milestone.id)).rejects.toThrow();
  });

  it("refuses to delete the summit even with no tasks", async () => {
    const [summit] = await db
      .insert(milestones)
      .values({ climbId, title: "Summit", position: 0, budget: MAX_ALTITUDE, isSummit: true })
      .returning();
    if (!summit) throw new Error("setup failed");

    await expect(deleteMilestone(summit.id)).rejects.toThrow();
  });
});

describe("reorderMilestones", () => {
  it("changes the cosmetic position order without touching budgets or task weights", async () => {
    await addMilestone(climbId, "A");
    const { milestones: afterB } = await addMilestone(climbId, "B");
    const campA = afterB.find((m) => m.title === "A");
    const campB = afterB.find((m) => m.title === "B");
    if (!campA || !campB) throw new Error("setup failed");

    const taskSnapshot = await addTask(campA.id, "In camp A");
    const task = taskSnapshot.tasks.find((t) => t.milestoneId === campA.id);
    if (!task) throw new Error("setup failed");
    const originalWeight = task.weight;

    const snapshot = await reorderMilestones(climbId, [campB.id, campA.id]);
    const sorted = [...snapshot.milestones].sort((a, b) => a.position - b.position);
    expect(sorted.map((m) => m.id)).toEqual([campB.id, campA.id]);

    // Purely cosmetic — budgets and task weights are untouched by reordering.
    const reloadedTask = snapshot.tasks.find((t) => t.id === task.id);
    expect(reloadedTask?.weight).toBe(originalWeight);
    const reloadedCampA = snapshot.milestones.find((m) => m.id === campA.id);
    const reloadedCampB = snapshot.milestones.find((m) => m.id === campB.id);
    expect(reloadedCampA?.budget).toBe(MAX_ALTITUDE / 2);
    expect(reloadedCampB?.budget).toBe(MAX_ALTITUDE / 2);
  });

  it("ignores any summit id in the input — the summit is never reordered", async () => {
    const [summit] = await db
      .insert(milestones)
      .values({ climbId, title: "Summit", position: 5, budget: MAX_ALTITUDE, isSummit: true })
      .returning();
    if (!summit) throw new Error("setup failed");
    await addMilestone(climbId, "A");
    const { milestones: afterB } = await addMilestone(climbId, "B");
    const campA = afterB.find((m) => m.title === "A");
    const campB = afterB.find((m) => m.title === "B");
    if (!campA || !campB) throw new Error("setup failed");

    const snapshot = await reorderMilestones(climbId, [summit.id, campB.id, campA.id]);
    const camps = snapshot.milestones.filter((m) => !m.isSummit).sort((a, b) => a.position - b.position);
    expect(camps.map((m) => m.id)).toEqual([campB.id, campA.id]);

    const reloadedSummit = snapshot.milestones.find((m) => m.id === summit.id);
    expect(reloadedSummit?.position).toBe(5); // untouched
  });
});
