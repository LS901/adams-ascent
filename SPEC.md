# Adam's Ascent — Build Spec (for review)

## Context

This is a personal gift for Adam: a single-user, gamified task tracker that visualizes his ~6-month journey toward becoming a personal trainer as a mountain climb. The repo (`adams-ascent/`) is currently empty (freshly initialized, just a placeholder README) — this is a greenfield build, not a modification of existing code.

This document is the spec to review before any implementation starts. It compiles the full brief into a concrete, buildable plan, resolves the handful of details the brief left open (confirmed with you via the questions above), and flags the few remaining assumptions inline so you can catch anything wrong before code gets written.

**Decisions locked in from your answers:**
- Auth: hand-rolled signed session cookie (no next-auth dependency).
- Motivational quotes: I'll write ~20 new ones (draft included below, easy to edit later — it's a static JSON file).
- Climber/campfire art: real Kenney.nl sprites, sourced during implementation (candidates identified below).
- Numeric defaults: as proposed, **except** the off-day blip is not capped at one tap/day — see "Blip cap" below for the revised mechanic.

---

## 1. Tech stack & project layout

- Next.js 15 (App Router) + TypeScript (strict mode), Tailwind CSS, deployed on Vercel.
- Turso (libSQL) + Drizzle ORM. Drizzle's libSQL driver also works against a local file (`file:./local.db`) or in-memory DB (`:memory:`) with zero code changes — this is what local dev and integration tests use, so tests hit a *real* SQLite-compatible database without needing network calls to Turso cloud.
- No Next.js middleware. Session-cookie verification (HMAC via Node's `crypto`) happens in a shared `getSession()` helper called from the root layout / page server components. This sidesteps the common gotcha where Next.js middleware runs on the Edge runtime and `bcrypt` (Node-only, used at login time) isn't Edge-compatible — by keeping everything in Node-runtime server components/actions, we avoid needing two different crypto implementations.

Proposed file layout:
```
adams-ascent/
  app/
    layout.tsx            # root layout, calls getSession(), redirects to /login if absent
    page.tsx               # the one real route: renders <Onboarding/> or <Dashboard/>
    login/page.tsx
  actions/
    auth.ts                # login/logout
    tasks.ts                # addTask, completeTask, missTask, undoTaskStatus, editTask, deleteTask
    milestones.ts           # addMilestone, editMilestone, deleteMilestone
    blips.ts                # logBlip
    climbs.ts               # startNewClimb, completeClimb
    onboarding.ts           # completeOnboarding
  lib/
    db/
      schema.ts
      client.ts
      seed.ts
    auth/session.ts         # sign/verify cookie, bcrypt compare
    altitude.ts             # pure: computeAltitude, crossedMilestones (unit tested)
    path.ts                 # pure: position-along-path interpolation (unit tested)
    quotes.json
  components/
    MountainScene.tsx, Climber.tsx, Campfire.tsx,
    TaskList.tsx, MilestoneList.tsx, HistoryList.tsx,
    QuoteBanner.tsx, MilestoneModal.tsx, SummitModal.tsx,
    UndoToast.tsx, BlipButton.tsx, OnboardingWizard.tsx
  tests/
    unit/          # altitude.test.ts, path.test.ts
    integration/   # tasks.test.ts, milestones.test.ts, blips.test.ts, climbs.test.ts, auth.test.ts
    e2e/           # the 5 Playwright journeys
```

Single route (`/`) that server-renders either the onboarding wizard or the dashboard depending on state — matches "no multi-page navigation needed" and avoids an extra redirect hop.

---

## 2. Environment variables

| Name | Purpose |
|---|---|
| `TURSO_DATABASE_URL` | libSQL connection string (prod) |
| `TURSO_AUTH_TOKEN` | Turso auth token (prod) |
| `ADMIN_USERNAME` | the one login username |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the one login password (never plaintext) |
| `SESSION_SECRET` | random 32+ byte secret used to HMAC-sign the session cookie |

Locally, `TURSO_DATABASE_URL=file:./local.db` (no token needed) points Drizzle at a local file instead of the cloud DB. `.env.example` will document all five with placeholder values; `.env` stays gitignored.

---

## 3. Data model

Four tables (three from the brief, plus one small addition explained below):

```ts
climbs {
  id: pk
  title: text
  summitAltitude: integer, default 3200
  status: 'active' | 'completed' | 'descended'
  onboardingComplete: boolean, default false   // ADDED — see note
  createdAt: timestamp
  completedAt: timestamp | null
}

tasks {
  id: pk
  climbId: fk -> climbs
  title: text
  status: 'pending' | 'done' | 'missed'
  weight: integer, default 60          // altitude gained on completion
  slipAmount: integer, default 25      // altitude lost if missed
  createdAt: timestamp
  resolvedAt: timestamp | null         // used for the undo window
}

milestones {
  id: pk
  climbId: fk -> climbs
  title: text
  altitude: integer                    // threshold on this climb's mountain
  reward: text | null
  rewardShown: boolean, default false
  createdAt: timestamp
}

blips {
  id: pk
  climbId: fk -> climbs
  date: date
  amount: integer                       // altitude lost, default 15
  createdAt: timestamp
}
```

**Schema note — `climbs.onboardingComplete`:** the brief asks for a persisted onboarding-complete flag but the given data model has nowhere to put it, and explicitly rules out a separate onboarding-only table. Adding one boolean column to `climbs` satisfies both constraints, and it happens to reuse cleanly: a fresh climb (the very first one, or a new one started after a summit) is created with `onboardingComplete=false`, so the *same* wizard component gates both "first ever use" and "starting the next mountain." The welcome copy on step 1 just checks whether any other climb row already exists to decide between "this is your climb" (true first-timer) vs. "onto the next mountain" phrasing — no extra flag needed for that distinction.

**Summit reward — reusing the milestone table instead of a new field:** the default seed milestones already end with "Summit: first client" at `altitude = summitAltitude`. Rather than adding a `summit_reward` column to `climbs`, that final milestone *is* the summit: its `reward` starts empty (unlike the other camps, where a reward is optional and set upfront) and gets filled in by a dedicated action when Adam types his reward into the big summit celebration modal. Reaching that final milestone's altitude skips the small milestone popup and goes straight to the big summit modal, so the two celebrations never double-fire.

---

## 4. Auth

- Login form posts to a Server Action: looks up `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` env vars, `bcrypt.compare()`s the submitted password.
- On success, issue a session cookie: payload `{ iat: <timestamp> }`, base64url-encoded, HMAC-SHA256 signed with `SESSION_SECRET`. Cookie is `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `Max-Age` 90 days (Adam's own phone, low attack surface — long-lived so he isn't re-logging-in constantly).
- `getSession()` helper: reads the cookie, verifies the HMAC signature, returns authenticated or not. Called at the top of `app/page.tsx` and any Server Action that mutates data; redirects to `/login` if invalid/absent.
- Logout: clears the cookie.
- No signup, no password reset, no user table.

---

## 5. Core mechanics

**Altitude** (pure function, unit tested):
```
altitude = max(0,
  sum(weight for tasks where status = 'done')
  - sum(slipAmount for tasks where status = 'missed')
  - sum(amount for blips on this climb)
)
```

**Milestone crossing** (pure function, unit tested): given previous altitude, new altitude, and the milestone list, return any milestones whose threshold falls in `(previous, new]` and have `rewardShown = false`. If the crossed milestone's altitude equals `summitAltitude`, it's routed to the summit modal instead of the small popup, and its `rewardShown` flag is set only once the summit flow completes (not on first crossing), since its reward is filled in *at* that moment rather than pre-set.

**Resting at camp:** if a climb has zero `pending` tasks, the dashboard shows the bonfire/resting state next to the climber. Never a penalty — purely a state, not a timer.

**Task miss:** explicit user action only. Sets `status='missed'`, `resolvedAt=now`, triggers a small toast + gentle animation, altitude recalculates. Never automatic.

**Blip ("today didn't go to plan"):** one button on the dashboard, not tied to a task.
- Each tap: `logBlip` inserts a row (`amount = 15`, `date = today`), altitude drops, warm copy shown ("that's alright — not every day is a climbing day").
- **Daily cap (revised per your answer):** not limited to one tap — instead, the *total* altitude deducted by blips on a given calendar day is capped at **30** (i.e., at most two taps register per day). Once today's blips already sum to the cap, the button shows a disabled/soft state with copy like "You've already had your dip for today — that's plenty." rather than silently no-op'ing, so it's clear why nothing happened. `logBlip` checks today's existing blip total for the climb before inserting and rejects (no-op, returns current state) once the cap would be exceeded.
- This keeps the "small step back, not a spiral" property from the brief while allowing more than one honest bad-day tap.

**Undo:** completing/missing a task shows a toast with "Undo" live for **6 seconds**. Undo reverts `status` to `'pending'`, clears `resolvedAt`, recalculates altitude. Implemented client-side (optimistic UI + toast timer) calling an `undoTaskStatus` Server Action.

**Edit/delete:** tasks and milestones editable (title, weight/altitude, reward) any time. Deletes require one lightweight confirm step (e.g. tap-to-confirm inline, not a full modal) — enough friction to stop an accidental swipe, not enough to be annoying on mobile.

**Summit:** altitude reaches `summitAltitude` → big celebration modal, reward field Adam fills in himself, then choice: **Keep going** (prompts a new climb title, reuses the onboarding wizard for the new climb's milestones/tasks, new `climbs` row with `status='active'`) or **Descend** (`status='completed'`, `completedAt=now`, warm closing screen, dashboard becomes view-only for that climb). Completed/descended climbs are kept, visible via a small "past climbs" list.

**Default numeric values** (as confirmed):
| Mechanic | Value |
|---|---|
| Task done | +60 altitude |
| Task missed | −25 altitude |
| Off-day blip | −15 altitude per tap, capped at −30/day total |
| Undo window | 6 seconds |
| Default summit altitude | 3200 |

**Default seed milestones** (first climb, spaced across summit altitude 3200):
| Camp | Altitude |
|---|---|
| Research courses | 300 |
| Enrol | 700 |
| Core modules | 1800 |
| Placement hours | 2600 |
| Certification | 3000 |
| Summit: first client | 3200 (= summit trigger, reward set live) |

---

## 6. Onboarding flow

Triggered whenever the active climb has `onboardingComplete = false` (true first run, or right after choosing "keep going" post-summit).

1. **Welcome** — short, warm copy. First-ever run gets the full "this is your climb, at your pace" framing; a later climb (detected by the existence of a prior completed/descended climb) gets a shorter "onto the next mountain" variant.
2. **Camps** — the default milestone list is pre-filled and shown as an ordered, editable list (rename, remove, add-your-own, drag to reorder, optional reward per camp — clearly marked skippable). Altitude values aren't manually typed here: reordering/adding/removing auto-redistributes each camp's altitude proportionally across the summit altitude, so Adam never has to think in numbers during onboarding. Precise altitude tweaking is still available later from the main dashboard's milestone editor.
3. **First tasks** — prompt for a handful of tasks (no pre-filled fake examples, since these are personal to his day-to-day — just placeholder/example text in the input, and copy making clear more can be added anytime from the dashboard). Skippable entirely.
4. **Done** — lands directly on the mountain dashboard, already reflecting whatever was just set up.

Every step is skippable and back-navigable. Finishing (or skipping to the end) sets `onboardingComplete = true` on the climb.

---

## 7. Server Actions

| Action | Notes |
|---|---|
| `login(username, password)` | bcrypt compare, sets session cookie |
| `logout()` | clears cookie |
| `addTask(climbId, title, weight?, slipAmount?)` | |
| `completeTask(taskId)` | sets done + resolvedAt, recalculates |
| `missTask(taskId)` | sets missed + resolvedAt |
| `undoTaskStatus(taskId)` | back to pending, only within the undo window |
| `editTask(taskId, fields)` | title/weight/slipAmount |
| `deleteTask(taskId)` | |
| `addMilestone(climbId, title, altitude, reward?)` | |
| `editMilestone(milestoneId, fields)` | title/altitude/reward |
| `deleteMilestone(milestoneId)` | |
| `logBlip(climbId)` | enforces the daily cap server-side |
| `startNewClimb(title, summitAltitude?)` | creates climb row, `onboardingComplete=false` |
| `completeClimb(climbId)` | marks completed/descended |
| `completeOnboarding(climbId, milestones[], tasks[])` | bulk-writes the wizard's output, sets flag |

All mutations are Server Actions — no separate API routes, per the brief.

---

## 8. Visual design

- **Trail:** thin SVG path, subtle elevation-contour styling, calm and map-like — not an illustrated landscape.
- **Climber:** the one illustrated/characterful element. Position along the path computed by mapping current altitude → fraction of `summitAltitude` → arc-length position on the SVG path (pure function, unit tested), so altitude always maps cleanly to a point on the trail.
- **Camps:** small nodes on the trail; reached = lit/gold, unreached = dim/grey.
- **Kenney.nl sprites** (sourced during implementation, per your answer):
  - Climber: **Platformer Characters** pack (`kenney.nl/assets/platformer-characters`, CC0) — includes a walking "adventurer" vector character with idle/walk frames that fit a small figure animating along a path.
  - Campfire: **Roguelike/RPG Pack** (`kenney.nl/assets/roguelike-rpg-pack`, CC0) — a large tile/icon set that's the best current candidate for a campfire tile; exact tile needs confirming once downloaded.
  - Fallback (per the brief's own instruction): if no campfire tile in that pack is a good fit, fall back to a small custom-drawn SVG campfire in the same flat, friendly style rather than an emoji/icon-font — this is a contingency, not the plan, and only kicks in if the sourced pack doesn't deliver.
- **Palette:** deep navy sky fading to warm amber/gold near the top, pine green + cream accents. No cream-and-terracotta template look, no dark-mode-single-accent look.
- **Type:** Baloo 2 (display/headings/quotes), Nunito (body), a monospace face for the altitude readout (e.g. JetBrains Mono or similar).
- **Mobile-first:** designed at phone width first (single column, thumb-reachable controls, no hover-dependent interactions, tap targets ≥44px), then checked at wider breakpoints — not a shrunk desktop layout.
- Reduced-motion respected (`prefers-reduced-motion`), visible focus states throughout.

---

## 9. Motivational quotes (draft, ~20)

Static JSON array, one shown at random per app load. Easy to hand-edit later — draft below for your review/edits:

1. "The mountain doesn't move. You just get closer to it, one step at a time."
2. "Every camp was once just a point on the map someone hadn't reached yet."
3. "You don't have to see the summit to keep climbing toward it."
4. "Slow going is still going."
5. "Rest is part of the route, not a detour from it."
6. "The trail doesn't care how you got here — only that you keep walking it."
7. "A bad day on the mountain is still a day on the mountain."
8. "You've carried yourself further than you think."
9. "Altitude is earned in small steps, not giant leaps."
10. "Even the steepest section ends at a flatter one."
11. "Nobody climbs a mountain in a straight line."
12. "The view gets better with every camp, even the ones you almost skipped."
13. "You're not behind. You're exactly as far as today allowed."
14. "Some days you climb. Some days you just hold your ground. Both count."
15. "The peak was never the only point — the climbing was."
16. "A slip is not a fall. Keep your footing and go again."
17. "Six months from now, this will look like the easy part."
18. "You don't need momentum to matter. You need one more step."
19. "The person who reaches the top is just the one who kept starting again."
20. "Somewhere above the clouds, there's a version of you already used to this."

---

## 10. Testing (trophy shape)

- **Static:** TypeScript strict mode, ESLint — no `any`, no unchecked nulls. First line of defence.
- **Unit (Vitest):** only genuinely isolated pure logic — `computeAltitude`, `crossedMilestones`, path-interpolation math. No DB mocking.
- **Integration (Vitest, largest layer):** Server Actions against a real test DB (local libSQL file/in-memory, reset between tests) — add/complete/miss/edit/delete for tasks and milestones, the undo window, milestone reward triggering, the blip daily cap, the summit → keep-going/descend flow, the auth gate.
- **E2E (Playwright, minimal):** exactly the 5 journeys from the brief — login→dashboard, first-time onboarding→working dashboard, complete a task→altitude persists after reload, reach a milestone→reward popup, reach the summit→celebration+choice. Not expanded further without good reason.
- TDD where practical for Server Actions/core behavior; visual/copy work (mountain SVG, onboarding tone) iterated first, tested after.

---

## 11. Build order

1. Scaffold Next.js + TS + Tailwind + Vercel config. Install the requested skills (`npx skills add ...` x6, plus the `typescript-advanced-types` search) and restart the session so they load.
2. Drizzle schema + local/test DB setup + seed script (first climb + default milestones).
3. Auth: login Server Action, session cookie helper, login page, root-layout gate.
4. Server Actions, test-first per the table in §7, integration tests alongside each.
5. Mountain/climber SVG + position-along-path logic (unit tested).
6. Wire up milestone popups, resting/slip states, undo toasts, blip button + cap, summit flow.
7. Onboarding wizard (shared between first-run and post-summit "keep going").
8. Polish: phone-width-first pass, reduced-motion, focus states, tap target audit.
9. Playwright E2E suite (5 journeys).

---

## 12. Open items for your sign-off

- Kenney sprite fit is only best-guessed from search, not yet visually confirmed — first thing checked hands-on in step 5, with the custom-SVG fallback ready if neither pack fits once actually downloaded.
- Quote wording above is a first draft — flag any that feel off-tone and I'll swap them before they're baked into the JSON file.
- Blip daily cap set to −30/day (two taps) as a reasonable middle ground between "capped at one" (rejected) and "uncapped" (would let a bad day spiral) — say if you want a different number.

---

## Appendix: skills-install deviations

A few of the skill names/sources in the original brief had moved since it was written. Substitutions made, using the same "install current top match" logic the brief itself specified for `typescript-advanced-types`:

| Requested | Installed instead | Why |
|---|---|---|
| `vercel-labs/agent-skills@frontend-design` | `vercel-labs/agent-skills@web-design-guidelines` | `frontend-design` no longer exists in that repo; this is the closest current equivalent (reviews UI against Vercel's Web Interface Guidelines). |
| `sanity-io/sanity@tdd` | `mattpocock/skills@tdd` | `tdd` no longer exists in `sanity-io/sanity`; `mattpocock/skills@tdd` is the clear highest-installs current match. |
| `sanity-io/next-sanity@vitest` | `antfu/skills@vitest` | `vitest` no longer exists in `sanity-io/next-sanity`; `antfu/skills@vitest` is the clear highest-installs current match. |

`typescript-advanced-types` resolved to `wshobson/agents@typescript-advanced-types` (57.4K installs, clear top match), as the brief anticipated.
