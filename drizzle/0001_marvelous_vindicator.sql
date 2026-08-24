CREATE TABLE `channelProvisioning` (
	`personaId` varchar(8) NOT NULL,
	`categoryName` varchar(64) NOT NULL,
	`discordCategoryId` varchar(32),
	`discordChannelId` varchar(32),
	`status` enum('pending','creating','ready','blocked','failed') NOT NULL DEFAULT 'pending',
	`attempts` int NOT NULL DEFAULT 0,
	`lastError` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `channelProvisioning_personaId` PRIMARY KEY(`personaId`)
);
--> statement-breakpoint
CREATE TABLE `discordConfiguration` (
	`id` varchar(32) NOT NULL,
	`guildId` varchar(32),
	`applicationId` varchar(32),
	`gatewayStatus` enum('not_configured','connecting','connected','degraded','offline') NOT NULL DEFAULT 'not_configured',
	`channelBootstrapStatus` enum('not_started','ready','running','blocked','failed') NOT NULL DEFAULT 'not_started',
	`lastGatewayHeartbeatAt` timestamp,
	`lastCommandSyncAt` timestamp,
	`lastError` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `discordConfiguration_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledgeItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`personaId` varchar(8) NOT NULL,
	`sourceId` int,
	`title` varchar(512) NOT NULL,
	`summary` text NOT NULL,
	`content` text NOT NULL,
	`tagsJson` text NOT NULL,
	`citationsJson` text NOT NULL,
	`status` enum('draft','published','superseded') NOT NULL DEFAULT 'draft',
	`reuseCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledgeItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledgeSources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`url` varchar(2048) NOT NULL,
	`title` varchar(512) NOT NULL,
	`publisher` varchar(255),
	`sourceType` enum('official','academic','industry','news','other') NOT NULL DEFAULT 'other',
	`vettingStatus` enum('pending','vetted','rejected') NOT NULL DEFAULT 'pending',
	`qualityScore` int NOT NULL DEFAULT 0,
	`excerpt` text,
	`contentHash` varchar(128),
	`reviewedBy` varchar(8),
	`reviewedAt` timestamp,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `knowledgeSources_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledgeSources_url_unique` UNIQUE(`url`)
);
--> statement-breakpoint
CREATE TABLE `personaActivities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`personaId` varchar(8) NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`summary` text NOT NULL,
	`metadataJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `personaActivities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `personas` (
	`id` varchar(8) NOT NULL,
	`name` varchar(32) NOT NULL,
	`role` varchar(128) NOT NULL,
	`group` varchar(64) NOT NULL,
	`channelSlug` varchar(100) NOT NULL,
	`operatingInstructions` text NOT NULL,
	`commandsJson` text NOT NULL,
	`status` enum('ready','learning','offline','attention') NOT NULL DEFAULT 'ready',
	`channelId` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `personas_id` PRIMARY KEY(`id`),
	CONSTRAINT `personas_name_unique` UNIQUE(`name`),
	CONSTRAINT `personas_channelSlug_unique` UNIQUE(`channelSlug`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`personaId` varchar(8) NOT NULL,
	`kind` enum('activity','research','escalation','system') NOT NULL,
	`severity` enum('info','watch','high','critical') NOT NULL DEFAULT 'info',
	`title` varchar(512) NOT NULL,
	`summary` text NOT NULL,
	`payloadJson` text NOT NULL,
	`acknowledgedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `researchRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`personaId` varchar(8) NOT NULL,
	`query` text NOT NULL,
	`model` varchar(128),
	`status` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
	`sourcesUsed` int NOT NULL DEFAULT 0,
	`error` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `researchRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `channelProvisioning` ADD CONSTRAINT `channelProvisioning_personaId_personas_id_fk` FOREIGN KEY (`personaId`) REFERENCES `personas`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledgeItems` ADD CONSTRAINT `knowledgeItems_personaId_personas_id_fk` FOREIGN KEY (`personaId`) REFERENCES `personas`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledgeItems` ADD CONSTRAINT `knowledgeItems_sourceId_knowledgeSources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `knowledgeSources`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledgeSources` ADD CONSTRAINT `knowledgeSources_reviewedBy_personas_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `personas`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `personaActivities` ADD CONSTRAINT `personaActivities_personaId_personas_id_fk` FOREIGN KEY (`personaId`) REFERENCES `personas`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_personaId_personas_id_fk` FOREIGN KEY (`personaId`) REFERENCES `personas`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `researchRuns` ADD CONSTRAINT `researchRuns_personaId_personas_id_fk` FOREIGN KEY (`personaId`) REFERENCES `personas`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `knowledge_persona_idx` ON `knowledgeItems` (`personaId`);--> statement-breakpoint
CREATE INDEX `knowledge_source_idx` ON `knowledgeItems` (`sourceId`);--> statement-breakpoint
CREATE INDEX `activity_persona_idx` ON `personaActivities` (`personaId`);--> statement-breakpoint
CREATE INDEX `activity_created_idx` ON `personaActivities` (`createdAt`);--> statement-breakpoint
CREATE INDEX `reports_persona_idx` ON `reports` (`personaId`);--> statement-breakpoint
CREATE INDEX `reports_created_idx` ON `reports` (`createdAt`);--> statement-breakpoint
CREATE INDEX `research_persona_idx` ON `researchRuns` (`personaId`);