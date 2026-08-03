-- Camp order is now earned by completion, not preset: `altitude` (a
-- position-derived cumulative threshold) is replaced by `budget` (a fixed
-- per-camp slice assigned by creation order), and `reward_shown` is replaced
-- by `completed_at`, which also drives which mountain line a camp claims.
-- `slip_amount` and the "missed" task status are dropped entirely — a task
-- is either pending, done, or deleted.
ALTER TABLE `milestones` ADD `budget` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `milestones` ADD `completed_at` integer;
--> statement-breakpoint
ALTER TABLE `milestones` DROP COLUMN `altitude`;
--> statement-breakpoint
ALTER TABLE `milestones` DROP COLUMN `reward_shown`;
--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `slip_amount`;
