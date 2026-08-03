// Fixed for every mountain — camps and task weights are all derived from
// this plus however many camps/tasks Adam sets up, so nothing here is
// manually entered.
export const MAX_ALTITUDE = 5000;

// Off-day check-in: small and capped, scaled to the fixed max altitude
// rather than to a task-weight constant (task weights now vary by camp).
export const BLIP_AMOUNT = Math.round(MAX_ALTITUDE * 0.005); // 25
export const BLIP_DAILY_CAP = Math.round(MAX_ALTITUDE * 0.01); // 50

export const UNDO_WINDOW_SECONDS = 6;

export const DEFAULT_MILESTONE_TITLES: readonly string[] = [
  "Research courses",
  "Enrol",
  "Core modules",
  "Placement hours",
  "Certification",
  "Summit: first client",
];
