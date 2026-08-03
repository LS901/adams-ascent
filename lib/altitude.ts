import { altitudeCeiling } from "./campMath";

export type TaskStatus = "pending" | "done";

export type TaskForAltitude = {
  status: TaskStatus;
  weight: number;
};

export type BlipForAltitude = {
  amount: number;
};

/**
 * The raw, uncapped altitude — just a sum of what's been earned and lost.
 * Camp order is earned by completion now (see lib/campMath.ts's
 * altitudeCeiling), so this alone isn't the number shown to Adam; callers
 * cap it against how many camps have actually been completed.
 */
export function computeAltitude(
  tasks: readonly TaskForAltitude[],
  blips: readonly BlipForAltitude[],
): number {
  const gained = tasks.filter((t) => t.status === "done").reduce((sum, t) => sum + t.weight, 0);
  const blipLoss = blips.reduce((sum, b) => sum + b.amount, 0);
  return Math.max(0, gained - blipLoss);
}

export type TaskForHistory = {
  milestoneId: number;
  status: "pending" | "done";
  weight: number;
  resolvedAt: Date | null;
};

export type BlipForHistory = {
  amount: number;
  createdAt: Date;
};

export type AltitudeHistoryPoint = {
  timestamp: number;
  altitude: number;
};

/**
 * The climb's altitude over time, as a running total — every done task and
 * blip in chronological order, each nudging the line up or down, capped at
 * every point by how many camps had actually been completed by then. This
 * is what the mountain scene's chart traces: it must never show the line
 * crossing a horizontal marker before that many camps were genuinely done,
 * even if raw partial progress across several unfinished camps would
 * otherwise have pushed it past.
 *
 * `tasks` should include every task in the climb, pending ones too — a
 * camp's total task count (done and pending) is needed to know the moment
 * its *last* task resolves.
 */
export function computeAltitudeHistory(
  tasks: readonly TaskForHistory[],
  blips: readonly BlipForHistory[],
  totalCampCount: number,
): AltitudeHistoryPoint[] {
  const totalTasksPerCamp = new Map<number, number>();
  for (const task of tasks) {
    totalTasksPerCamp.set(task.milestoneId, (totalTasksPerCamp.get(task.milestoneId) ?? 0) + 1);
  }

  const events: { timestamp: number; delta: number; milestoneId?: number }[] = [
    ...tasks
      .filter((t): t is TaskForHistory & { resolvedAt: Date } => t.status === "done" && t.resolvedAt !== null)
      .map((t) => ({ timestamp: t.resolvedAt.getTime(), delta: t.weight, milestoneId: t.milestoneId })),
    ...blips.map((b) => ({ timestamp: b.createdAt.getTime(), delta: -b.amount })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  const firstTimestamp = events[0]?.timestamp ?? Date.now();
  const points: AltitudeHistoryPoint[] = [{ timestamp: firstTimestamp, altitude: 0 }];

  let raw = 0;
  const doneCountPerCamp = new Map<number, number>();
  const completedCamps = new Set<number>();

  for (const event of events) {
    raw = Math.max(0, raw + event.delta);

    if (event.milestoneId !== undefined) {
      const doneCount = (doneCountPerCamp.get(event.milestoneId) ?? 0) + 1;
      doneCountPerCamp.set(event.milestoneId, doneCount);
      if (doneCount === totalTasksPerCamp.get(event.milestoneId)) {
        completedCamps.add(event.milestoneId);
      }
    }

    const effective = Math.min(raw, altitudeCeiling(totalCampCount, completedCamps.size));
    points.push({ timestamp: event.timestamp, altitude: effective });
  }

  return points;
}
