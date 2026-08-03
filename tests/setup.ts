import path from "node:path";
import { beforeAll, beforeEach, vi } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "../lib/db/client";
import { blips, climbs, milestones, tasks } from "../lib/db/schema";
import { fakeCookies, resetCookieStore } from "./mocks/nextHeaders";
import { RedirectSignal } from "./mocks/nextNavigation";

// next/headers and next/navigation only work inside a real Next.js request
// lifecycle. These fakes let Server Actions be exercised directly against a
// real test database without mocking our own db/business logic.
vi.mock("next/headers", () => ({
  cookies: async () => fakeCookies(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

beforeAll(async () => {
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../drizzle") });
});

beforeEach(async () => {
  resetCookieStore();
  await db.delete(blips);
  await db.delete(tasks);
  await db.delete(milestones);
  await db.delete(climbs);
});
