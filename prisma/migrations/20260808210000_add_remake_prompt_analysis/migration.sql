-- Append-only Prompt analysis tracks and versions for remake shots.
CREATE TABLE `remake_prompt_tracks` (
  `id` VARCHAR(191) NOT NULL,
  `remakeProjectId` VARCHAR(191) NOT NULL,
  `shotId` VARCHAR(191) NOT NULL,
  `targetKey` VARCHAR(191) NOT NULL,
  `adoptedVersionId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `remake_prompt_tracks_adoptedVersionId_key` (`adoptedVersionId`),
  UNIQUE INDEX `remake_prompt_tracks_shotId_targetKey_key` (`shotId`, `targetKey`),
  INDEX `remake_prompt_tracks_remakeProjectId_idx` (`remakeProjectId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_prompt_runs` (
  `id` VARCHAR(191) NOT NULL,
  `remakeProjectId` VARCHAR(191) NOT NULL,
  `taskId` VARCHAR(191) NULL,
  `targetKey` VARCHAR(191) NOT NULL,
  `inputFingerprint` VARCHAR(191) NOT NULL,
  `schemaVersion` VARCHAR(191) NULL,
  `modelVersion` VARCHAR(191) NULL,
  `executorVersion` VARCHAR(191) NULL,
  `rawOutput` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `remake_prompt_runs_remakeProjectId_idx` (`remakeProjectId`),
  INDEX `remake_prompt_runs_taskId_idx` (`taskId`),
  INDEX `remake_prompt_runs_inputFingerprint_idx` (`inputFingerprint`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_prompt_versions` (
  `id` VARCHAR(191) NOT NULL,
  `trackId` VARCHAR(191) NOT NULL,
  `runId` VARCHAR(191) NULL,
  `shotRevisionId` VARCHAR(191) NULL,
  `versionNumber` INTEGER NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending_review',
  `inputFingerprint` VARCHAR(191) NOT NULL,
  `inputSnapshot` JSON NOT NULL,
  `parsedSections` JSON NULL,
  `integratedGenerationPrompt` LONGTEXT NOT NULL,
  `negativeConstraints` JSON NULL,
  `rawOutput` LONGTEXT NULL,
  `skillVersion` VARCHAR(191) NULL,
  `schemaVersion` VARCHAR(191) NULL,
  `modelVersion` VARCHAR(191) NULL,
  `executorVersion` VARCHAR(191) NULL,
  `taskId` VARCHAR(191) NULL,
  `reviewerId` VARCHAR(191) NULL,
  `reviewedAt` DATETIME(3) NULL,
  `invalidatedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `remake_prompt_versions_trackId_versionNumber_key` (`trackId`, `versionNumber`),
  INDEX `remake_prompt_versions_runId_idx` (`runId`),
  INDEX `remake_prompt_versions_shotRevisionId_idx` (`shotRevisionId`),
  INDEX `remake_prompt_versions_taskId_idx` (`taskId`),
  INDEX `remake_prompt_versions_inputFingerprint_idx` (`inputFingerprint`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `remake_invalidations` ADD COLUMN `promptVersionId` VARCHAR(191) NULL;
CREATE INDEX `remake_invalidations_promptVersionId_idx` ON `remake_invalidations`(`promptVersionId`);

ALTER TABLE `remake_prompt_tracks` ADD CONSTRAINT `remake_prompt_tracks_remakeProjectId_fkey` FOREIGN KEY (`remakeProjectId`) REFERENCES `remake_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_prompt_tracks` ADD CONSTRAINT `remake_prompt_tracks_shotId_fkey` FOREIGN KEY (`shotId`) REFERENCES `remake_shots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_prompt_tracks` ADD CONSTRAINT `remake_prompt_tracks_adoptedVersionId_fkey` FOREIGN KEY (`adoptedVersionId`) REFERENCES `remake_prompt_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_prompt_runs` ADD CONSTRAINT `remake_prompt_runs_remakeProjectId_fkey` FOREIGN KEY (`remakeProjectId`) REFERENCES `remake_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_prompt_versions` ADD CONSTRAINT `remake_prompt_versions_trackId_fkey` FOREIGN KEY (`trackId`) REFERENCES `remake_prompt_tracks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_prompt_versions` ADD CONSTRAINT `remake_prompt_versions_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `remake_prompt_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_prompt_versions` ADD CONSTRAINT `remake_prompt_versions_shotRevisionId_fkey` FOREIGN KEY (`shotRevisionId`) REFERENCES `remake_shot_revisions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_invalidations` ADD CONSTRAINT `remake_invalidations_promptVersionId_fkey` FOREIGN KEY (`promptVersionId`) REFERENCES `remake_prompt_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
