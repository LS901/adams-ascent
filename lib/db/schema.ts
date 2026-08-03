import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const climbs = sqliteTable("climbs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  // No per-climb summit altitude column: every mountain tops out at the
  // fixed MAX_ALTITUDE constant (see lib/constants.ts).
  status: text("status", { enum: ["active", "completed", "descended"] })
    .notNull()
    .default("active"),
  onboardingComplete: integer("onboarding_complete", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  climbId: integer("climb_id")
    .notNull()
    .references(() => climbs.id),
  milestoneId: integer("milestone_id")
    .notNull()
    .references(() => milestones.id),
  title: text("title").notNull(),
  status: text("status", { enum: ["pending", "done"] })
    .notNull()
    .default("pending"),
  // Auto-calculated from the camp's fixed budget and how many tasks share
  // it — see lib/campMath.ts. Frozen once a task resolves; recalculated for
  // still-pending siblings whenever the camp's pending task count changes.
  weight: integer("weight").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
});

export const milestones = sqliteTable("milestones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  climbId: integer("climb_id")
    .notNull()
    .references(() => climbs.id),
  title: text("title").notNull(),
  // Cosmetic only — Adam's intended working order among camps in the Camps
  // list and dashboard tabs. Has no effect on altitude, budgets, or which
  // mountain line a camp claims (see completedAt). Meaningless for the
  // summit, which is never reordered.
  position: integer("position").notNull(),
  // This milestone's fixed slice of MAX_ALTITUDE. Camps are assigned theirs
  // by id (creation) order among camps only; the summit always gets the
  // final slice. See lib/climb.ts's rebalanceAllCamps.
  budget: integer("budget").notNull(),
  reward: text("reward"),
  // Exactly one milestone per climb. Structurally separate from camps: it's
  // always the final mountain line (at MAX_ALTITUDE), can't be reordered,
  // added, or deleted — camps are earned order and freely managed, but the
  // summit is fixed, same as it's always been.
  isSummit: integer("is_summit", { mode: "boolean" }).notNull().default(false),
  // Null until every task in this milestone is Done, at which point it's
  // set to the moment that happened. For camps, sorted by this to determine
  // which mountain line each one claims (first to complete gets line 1);
  // the summit's own line is always last regardless of completedAt.
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const blips = sqliteTable("blips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  climbId: integer("climb_id")
    .notNull()
    .references(() => climbs.id),
  date: text("date").notNull(),
  amount: integer("amount").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type Climb = typeof climbs.$inferSelect;
export type NewClimb = typeof climbs.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Milestone = typeof milestones.$inferSelect;
export type NewMilestone = typeof milestones.$inferInsert;
export type Blip = typeof blips.$inferSelect;
export type NewBlip = typeof blips.$inferInsert;
