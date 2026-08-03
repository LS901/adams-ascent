import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { blips, climbs, milestones, tasks } from "../../lib/db/schema";
import { DEFAULT_MILESTONE_TITLES, MAX_ALTITUDE } from "../../lib/constants";
import { campBudget, evenlySpacedAltitudes } from "../../lib/campMath";
import { E2E_DB_PATH } from "../../playwright.config";

/**
 * Resets the e2e database to a known clean state via SQL, not by deleting
 * the file — the Next.js webServer may already hold it open by the time
 * this runs, and file deletion races that lock. Uses its own direct
 * connection (not lib/db/client.ts) since this runs outside the webServer's
 * env, so TURSO_DATABASE_URL isn't necessarily set in this process.
 */
async function globalSetup() {
  const client = createClient({ url: `file:${E2E_DB_PATH}` });
  const db = drizzle(client);

  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });

  await db.delete(blips);
  await db.delete(tasks);
  await db.delete(milestones);
  await db.delete(climbs);

  const [climb] = await db
    .insert(climbs)
    .values({ title: "Become a PT", status: "active" })
    .returning();

  if (!climb) {
    throw new Error("E2E global setup: failed to create seed climb");
  }

  // The last default title ("Summit: first client") is the fixed summit;
  // everything before it is a regular, freely reorderable camp.
  const campTitles = DEFAULT_MILESTONE_TITLES.slice(0, -1);
  const summitTitle = DEFAULT_MILESTONE_TITLES.at(-1) ?? "Summit";
  const thresholds = evenlySpacedAltitudes(DEFAULT_MILESTONE_TITLES.length, MAX_ALTITUDE);

  await db.insert(milestones).values(
    campTitles.map((title, position) => ({
      climbId: climb.id,
      title,
      position,
      budget: campBudget(thresholds, position),
    })),
  );
  await db.insert(milestones).values({
    climbId: climb.id,
    title: summitTitle,
    position: campTitles.length,
    budget: campBudget(thresholds, campTitles.length),
    isSummit: true,
  });

  client.close();
}

export default globalSetup;
