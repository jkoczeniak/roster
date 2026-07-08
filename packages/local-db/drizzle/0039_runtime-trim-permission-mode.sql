ALTER TABLE `settings` ADD `agent_permission_mode` text DEFAULT 'guarded' NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `provider_api_keys`;