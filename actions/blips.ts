"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../lib/db/client";
import { blips, type Blip } from "../lib/db/schema";
import { requireAuthenticated } from "../lib/auth/session";
import { applyAltitudeChange } from "../lib/climb";
import { BLIP_AMOUNT, BLIP_DAILY_CAP } from "../lib/constants";

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export type LogBlipResult =
  | { ok: true; altitude: number; blip: Blip }
  | { ok: false; reason: "daily-cap-reached" };

export async function logBlip(climbId: number): Promise<LogBlipResult> {
  await requireAuthenticated();

  const today = todayDateString();
  const todaysBlips = await db
    .select()
    .from(blips)
    .where(and(eq(blips.climbId, climbId), eq(blips.date, today)));

  const todaysTotal = todaysBlips.reduce((sum, b) => sum + b.amount, 0);
  if (todaysTotal + BLIP_AMOUNT > BLIP_DAILY_CAP) {
    return { ok: false, reason: "daily-cap-reached" };
  }

  let created: Blip | undefined;
  const { altitude } = await applyAltitudeChange(climbId, async () => {
    const [blip] = await db
      .insert(blips)
      .values({ climbId, date: today, amount: BLIP_AMOUNT })
      .returning();
    created = blip;
  });

  if (!created) {
    throw new Error("Failed to create blip");
  }

  revalidatePath("/");
  return { ok: true, altitude, blip: created };
}
