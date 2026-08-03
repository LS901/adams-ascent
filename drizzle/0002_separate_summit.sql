-- The summit is a distinct, structurally fixed milestone again — always
-- the final mountain line, never reordered/added/deleted like camps.
ALTER TABLE `milestones` ADD `is_summit` integer DEFAULT false NOT NULL;
