import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { isAuthenticated } from "../lib/auth/session";
import { db } from "../lib/db/client";
import { blips, climbs, milestones, tasks } from "../lib/db/schema";
import { getAltitudeForClimb } from "../lib/climb";
import { DashboardClient } from "../components/DashboardClient";
import { OnboardingWizard } from "../components/OnboardingWizard";
import { BetweenClimbs } from "../components/BetweenClimbs";

export default async function Home() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }

  const [activeClimb] = await db.select().from(climbs).where(eq(climbs.status, "active")).limit(1);

  if (!activeClimb) {
    const [mostRecentClimb] = await db.select().from(climbs).orderBy(desc(climbs.id)).limit(1);
    return <BetweenClimbs previousClimb={mostRecentClimb ?? null} />;
  }

  if (!activeClimb.onboardingComplete) {
    const climbMilestones = await db
      .select()
      .from(milestones)
      .where(eq(milestones.climbId, activeClimb.id));

    const hasPriorClimb = await db
      .select()
      .from(climbs)
      .where(eq(climbs.status, "completed"));

    return (
      <OnboardingWizard
        climb={activeClimb}
        initialMilestones={climbMilestones}
        isFirstEverClimb={hasPriorClimb.length === 0}
      />
    );
  }

  const [climbTasks, climbMilestones, climbBlips, altitude] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.climbId, activeClimb.id)),
    db.select().from(milestones).where(eq(milestones.climbId, activeClimb.id)),
    db.select().from(blips).where(eq(blips.climbId, activeClimb.id)),
    getAltitudeForClimb(activeClimb.id),
  ]);

  return (
    <DashboardClient
      climb={activeClimb}
      initialTasks={climbTasks}
      initialMilestones={climbMilestones}
      initialBlips={climbBlips}
      initialAltitude={altitude}
    />
  );
}
