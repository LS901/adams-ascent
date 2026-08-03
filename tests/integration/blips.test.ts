import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../lib/db/client";
import { climbs } from "../../lib/db/schema";
import { addMilestone } from "../../actions/milestones";
import { addTask, completeTask } from "../../actions/tasks";
import { logBlip } from "../../actions/blips";
import { createSession } from "../../lib/auth/session";
import { MAX_ALTITUDE } from "../../lib/constants";

let climbId: number;

beforeEach(async () => {
  await createSession();
  const [climb] = await db.insert(climbs).values({ title: "Test Climb" }).returning();
  if (!climb) throw new Error("setup failed");
  climbId = climb.id;

  const { milestones } = await addMilestone(climbId, "Only camp");
  const milestone = milestones[0];
  if (!milestone) throw new Error("setup failed");
  const taskSnapshot = await addTask(milestone.id, "Warm-up"); // weight = full MAX_ALTITUDE budget
  const task = taskSnapshot.tasks.find((t) => t.milestoneId === milestone.id);
  if (!task) throw new Error("setup failed");
  await completeTask(task.id);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("logBlip", () => {
  it("subtracts the blip amount from altitude", async () => {
    const result = await logBlip(climbId);
    expect(result).toMatchObject({ ok: true, altitude: MAX_ALTITUDE - 25 });
  });

  it("allows a second blip the same day up to the daily cap", async () => {
    await logBlip(climbId);
    const second = await logBlip(climbId);
    expect(second).toMatchObject({ ok: true, altitude: MAX_ALTITUDE - 50 });
  });

  it("rejects a third blip once the daily cap is reached", async () => {
    await logBlip(climbId);
    await logBlip(climbId);
    const third = await logBlip(climbId);
    expect(third).toEqual({ ok: false, reason: "daily-cap-reached" });
  });

  it("resets the cap on a new calendar day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    await logBlip(climbId);
    await logBlip(climbId);
    expect(await logBlip(climbId)).toEqual({ ok: false, reason: "daily-cap-reached" });

    vi.setSystemTime(new Date("2026-01-02T12:00:00Z"));
    const nextDay = await logBlip(climbId);
    expect(nextDay).toMatchObject({ ok: true, altitude: MAX_ALTITUDE - 75 });
  });
});
