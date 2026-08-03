import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../lib/db/client";
import { climbs, milestones, tasks } from "../../lib/db/schema";
import {
  completeClimb,
  completeOnboarding,
  reachSummit,
  recordSummitReward,
  startNewClimb,
} from "../../actions/climbs";
import { addTask, completeTask } from "../../actions/tasks";
import { createSession } from "../../lib/auth/session";
import { MAX_ALTITUDE, DEFAULT_MILESTONE_TITLES } from "../../lib/constants";

let climbId: number;

beforeEach(async () => {
  await createSession();
  const [climb] = await db.insert(climbs).values({ title: "Become a PT" }).returning();
  if (!climb) throw new Error("setup failed");
  climbId = climb.id;

  await db.insert(milestones).values([
    { climbId, title: "Research courses", position: 0, budget: MAX_ALTITUDE / 2 },
    { climbId, title: "First client", position: 1, budget: MAX_ALTITUDE / 2, isSummit: true },
  ]);
});

describe("completeClimb", () => {
  it("marks the climb completed with a completedAt timestamp", async () => {
    const updated = await completeClimb(climbId);
    expect(updated.status).toBe("completed");
    expect(updated.completedAt).not.toBeNull();
  });
});

describe("startNewClimb", () => {
  it("marks the previous climb descended and creates a new active one", async () => {
    const newClimb = await startNewClimb("Marathon training", climbId);

    expect(newClimb.status).toBe("active");
    expect(newClimb.title).toBe("Marathon training");
    expect(newClimb.onboardingComplete).toBe(false);

    const [previous] = await db.select().from(climbs).where(eq(climbs.id, climbId));
    expect(previous?.status).toBe("descended");
    expect(previous?.completedAt).not.toBeNull();
  });

  it("seeds the new climb with the default camps and a single fixed summit", async () => {
    const newClimb = await startNewClimb("Marathon training", climbId);
    const seeded = await db.select().from(milestones).where(eq(milestones.climbId, newClimb.id));

    expect(seeded).toHaveLength(DEFAULT_MILESTONE_TITLES.length);
    const summits = seeded.filter((m) => m.isSummit);
    expect(summits).toHaveLength(1);
    expect(summits[0]?.title).toBe(DEFAULT_MILESTONE_TITLES.at(-1));

    const totalBudget = seeded.reduce((sum, m) => sum + m.budget, 0);
    expect(totalBudget).toBe(MAX_ALTITUDE);
  });

  it("rejects an empty title", async () => {
    await expect(startNewClimb("   ", climbId)).rejects.toThrow();
  });

  it("does not touch a previous climb that's already completed", async () => {
    await completeClimb(climbId);
    await startNewClimb("Next thing", climbId);

    const [previous] = await db.select().from(climbs).where(eq(climbs.id, climbId));
    expect(previous?.status).toBe("completed");
  });

  it("works with no previous climb at all", async () => {
    const newClimb = await startNewClimb("Fresh start");
    expect(newClimb.status).toBe("active");
  });
});

describe("recordSummitReward", () => {
  it("finds the climb's summit directly and sets the reward text on it", async () => {
    const updated = await recordSummitReward(climbId, "New running shoes");
    expect(updated.title).toBe("First client");
    expect(updated.isSummit).toBe(true);
    expect(updated.reward).toBe("New running shoes");
  });

  it("rejects an empty reward", async () => {
    await expect(recordSummitReward(climbId, "  ")).rejects.toThrow();
  });

  it("throws if the climb has no summit", async () => {
    const [bareClimb] = await db.insert(climbs).values({ title: "No summit yet" }).returning();
    if (!bareClimb) throw new Error("setup failed");

    await expect(recordSummitReward(bareClimb.id, "Reward")).rejects.toThrow();
  });
});

describe("reachSummit", () => {
  async function getCamp() {
    const [camp] = await db
      .select()
      .from(milestones)
      .where(and(eq(milestones.climbId, climbId), eq(milestones.isSummit, false)));
    if (!camp) throw new Error("setup failed");
    return camp;
  }

  it("throws if any camp is still incomplete", async () => {
    await expect(reachSummit(climbId)).rejects.toThrow();
  });

  it("marks the summit reached once every camp is complete, regardless of its own tasks", async () => {
    const camp = await getCamp();
    const snapshot = await addTask(camp.id, "Only task");
    const task = snapshot.tasks.find((t) => t.milestoneId === camp.id);
    if (!task) throw new Error("setup failed");
    await completeTask(task.id);

    const result = await reachSummit(climbId);
    expect(result.summit.isSummit).toBe(true);
    expect(result.summit.completedAt).not.toBeNull();
  });

  it("throws if the summit has already been reached", async () => {
    const camp = await getCamp();
    const snapshot = await addTask(camp.id, "Only task");
    const task = snapshot.tasks.find((t) => t.milestoneId === camp.id);
    if (!task) throw new Error("setup failed");
    await completeTask(task.id);
    await reachSummit(climbId);

    await expect(reachSummit(climbId)).rejects.toThrow();
  });

  it("succeeds immediately for a climb with zero camps", async () => {
    const [bareClimb] = await db.insert(climbs).values({ title: "Summit only" }).returning();
    if (!bareClimb) throw new Error("setup failed");
    await db.insert(milestones).values({
      climbId: bareClimb.id,
      title: "Summit",
      position: 0,
      budget: MAX_ALTITUDE,
      isSummit: true,
    });

    const result = await reachSummit(bareClimb.id);
    expect(result.summit.completedAt).not.toBeNull();
  });
});

describe("completeOnboarding", () => {
  it("replaces existing milestones, assigns tasks, and flags onboarding done", async () => {
    await completeOnboarding(
      climbId,
      [{ title: "Research courses" }],
      { title: "First client", reward: "Coffee" },
      [
        { title: "Look up local courses", campIndex: 0 },
        { title: "Book a call", campIndex: 1 },
      ],
    );

    const seeded = await db.select().from(milestones).where(eq(milestones.climbId, climbId));
    expect(seeded).toHaveLength(2);
    const summit = seeded.find((m) => m.isSummit);
    expect(summit?.title).toBe("First client");
    expect(summit?.reward).toBe("Coffee");
    expect(summit?.budget).toBe(MAX_ALTITUDE / 2);

    const climbTasks = await db.select().from(tasks).where(eq(tasks.climbId, climbId));
    expect(climbTasks).toHaveLength(2);
    const bookACall = climbTasks.find((t) => t.title === "Book a call");
    expect(bookACall?.milestoneId).toBe(summit?.id);
    expect(bookACall?.weight).toBe(MAX_ALTITUDE / 2);

    const [climb] = await db.select().from(climbs).where(eq(climbs.id, climbId));
    expect(climb?.onboardingComplete).toBe(true);
  });

  it("filters out blank task titles", async () => {
    await completeOnboarding(climbId, [], { title: "Just the summit" }, [{ title: "", campIndex: 0 }]);

    const climbTasks = await db.select().from(tasks).where(eq(tasks.climbId, climbId));
    expect(climbTasks).toHaveLength(0);
  });

  it("rejects a blank summit name", async () => {
    await expect(completeOnboarding(climbId, [{ title: "A camp" }], { title: "  " }, [])).rejects.toThrow();
  });

  it("allows zero camps as long as the summit is named", async () => {
    await completeOnboarding(climbId, [], { title: "Just the summit" }, []);
    const seeded = await db.select().from(milestones).where(eq(milestones.climbId, climbId));
    expect(seeded).toHaveLength(1);
    expect(seeded[0]?.isSummit).toBe(true);
  });

  it("works with no tasks given (onboarding tasks step skipped)", async () => {
    await completeOnboarding(climbId, [{ title: "Just one camp" }], { title: "Summit" }, []);
    const climbTasks = await db.select().from(tasks).where(eq(tasks.climbId, climbId));
    expect(climbTasks).toHaveLength(0);
  });
});
