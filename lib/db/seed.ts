import "dotenv/config";
import { db } from "./client";
import { climbs, milestones } from "./schema";
import { DEFAULT_MILESTONE_TITLES } from "../constants";
import { rebalanceAllCamps } from "../climb";

async function seed() {
  const existing = await db.select().from(climbs).limit(1);
  if (existing.length > 0) {
    console.log("Climbs already exist — skipping seed.");
    return;
  }

  const [climb] = await db
    .insert(climbs)
    .values({ title: "Become a PT", status: "active", onboardingComplete: false })
    .returning();

  if (!climb) {
    throw new Error("Failed to create seed climb");
  }

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

  console.log(`Seeded climb "${climb.title}" with ${DEFAULT_MILESTONE_TITLES.length} milestones.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
