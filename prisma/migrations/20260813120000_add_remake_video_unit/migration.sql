-- Durable append-only Remake unit video generation history (D-01/D-04/D-17).
ALTER TABLE `remake_provenance_records`
  ADD COLUMN `unitBatchId` VARCHAR(191) NULL;
CREATE INDEX `remake_provenance_records_unitBatchId_idx` ON `remake_provenance_records`(`unitBatchId`);

ALTER TABLE `remake_invalidations`
  ADD COLUMN `unitTrackId` VARCHAR(191) NULL,
  ADD COLUMN `unitBatchId` VARCHAR(191) NULL,
  ADD COLUMN `unitVersionId` VARCHAR(191) NULL;
CREATE INDEX `remake_invalidations_unitTrackId_idx` ON `remake_invalidations`(`unitTrackId`);
CREATE INDEX `remake_invalidations_unitBatchId_idx` ON `remake_invalidations`(`unitBatchId`);
CREATE INDEX `remake_invalidations_unitVersionId_idx` ON `remake_invalidations`(`unitVersionId`);

CREATE TABLE `remake_video_units` (
  `id` VARCHAR(191) NOT NULL,
  `remakeProjectId` VARCHAR(191) NOT NULL,
  `userLabel` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `remake_video_units_remakeProjectId_idx` (`remakeProjectId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_video_unit_members` (
  `id` VARCHAR(191) NOT NULL,
  `unitId` VARCHAR(191) NOT NULL,
  `shotRevisionId` VARCHAR(191) NOT NULL,
  `ordinal` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `remake_video_unit_members_unitId_ordinal_key` (`unitId`, `ordinal`),
  UNIQUE INDEX `remake_video_unit_members_shotRevisionId_key` (`shotRevisionId`),
  INDEX `remake_video_unit_members_unitId_idx` (`unitId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_video_unit_tracks` (
  `id` VARCHAR(191) NOT NULL,
  `unitId` VARCHAR(191) NOT NULL,
  `adoptedVersionId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `remake_video_unit_tracks_adoptedVersionId_key` (`adoptedVersionId`),
  UNIQUE INDEX `remake_video_unit_tracks_unitId_key` (`unitId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_video_unit_batches` (
  `id` VARCHAR(191) NOT NULL,
  `trackId` VARCHAR(191) NOT NULL,
  `promptVersionId` VARCHAR(191) NULL,
  `taskId` VARCHAR(191) NULL,
  `operationKey` VARCHAR(191) NOT NULL,
  `inputFingerprint` VARCHAR(191) NOT NULL,
  `inputSnapshot` JSON NOT NULL,
  `modelId` VARCHAR(191) NOT NULL,
  `modelOptions` JSON NOT NULL,
  `orderedReferences` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `remake_video_unit_batches_trackId_operationKey_key` (`trackId`, `operationKey`),
  INDEX `remake_video_unit_batches_promptVersionId_idx` (`promptVersionId`),
  INDEX `remake_video_unit_batches_taskId_idx` (`taskId`),
  INDEX `remake_video_unit_batches_inputFingerprint_idx` (`inputFingerprint`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_video_unit_versions` (
  `id` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `outputVersionId` VARCHAR(191) NOT NULL,
  `ordinal` INTEGER NOT NULL,
  `note` TEXT NULL,
  `reviewerId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `remake_video_unit_versions_outputVersionId_key` (`outputVersionId`),
  UNIQUE INDEX `remake_video_unit_versions_batchId_ordinal_key` (`batchId`, `ordinal`),
  INDEX `remake_video_unit_versions_batchId_createdAt_idx` (`batchId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_video_unit_adoption_events` (
  `id` VARCHAR(191) NOT NULL,
  `trackId` VARCHAR(191) NOT NULL,
  `previousVersionId` VARCHAR(191) NULL,
  `nextVersionId` VARCHAR(191) NULL,
  `reviewerId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `remake_video_unit_adoption_events_trackId_createdAt_idx` (`trackId`, `createdAt`),
  INDEX `remake_video_unit_adoption_events_previousVersionId_idx` (`previousVersionId`),
  INDEX `remake_video_unit_adoption_events_nextVersionId_idx` (`nextVersionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_video_unit_action_sheets` (
  `id` VARCHAR(191) NOT NULL,
  `unitId` VARCHAR(191) NOT NULL,
  `fingerprint` VARCHAR(191) NOT NULL,
  `mediaId` VARCHAR(191) NULL,
  `sources` JSON NOT NULL,
  `taskId` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `remake_video_unit_action_sheets_unitId_fingerprint_key` (`unitId`, `fingerprint`),
  INDEX `remake_video_unit_action_sheets_unitId_idx` (`unitId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `remake_provenance_records` ADD CONSTRAINT `remake_provenance_records_unitBatchId_fkey` FOREIGN KEY (`unitBatchId`) REFERENCES `remake_video_unit_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_invalidations` ADD CONSTRAINT `remake_invalidations_unitTrackId_fkey` FOREIGN KEY (`unitTrackId`) REFERENCES `remake_video_unit_tracks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_invalidations` ADD CONSTRAINT `remake_invalidations_unitBatchId_fkey` FOREIGN KEY (`unitBatchId`) REFERENCES `remake_video_unit_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_invalidations` ADD CONSTRAINT `remake_invalidations_unitVersionId_fkey` FOREIGN KEY (`unitVersionId`) REFERENCES `remake_video_unit_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_video_units` ADD CONSTRAINT `remake_video_units_remakeProjectId_fkey` FOREIGN KEY (`remakeProjectId`) REFERENCES `remake_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_video_unit_members` ADD CONSTRAINT `remake_video_unit_members_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `remake_video_units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_video_unit_tracks` ADD CONSTRAINT `remake_video_unit_tracks_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `remake_video_units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_video_unit_tracks` ADD CONSTRAINT `remake_video_unit_tracks_adoptedVersionId_fkey` FOREIGN KEY (`adoptedVersionId`) REFERENCES `remake_video_unit_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_video_unit_batches` ADD CONSTRAINT `remake_video_unit_batches_trackId_fkey` FOREIGN KEY (`trackId`) REFERENCES `remake_video_unit_tracks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_video_unit_batches` ADD CONSTRAINT `remake_video_unit_batches_promptVersionId_fkey` FOREIGN KEY (`promptVersionId`) REFERENCES `remake_prompt_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_video_unit_versions` ADD CONSTRAINT `remake_video_unit_versions_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `remake_video_unit_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_video_unit_versions` ADD CONSTRAINT `remake_video_unit_versions_outputVersionId_fkey` FOREIGN KEY (`outputVersionId`) REFERENCES `remake_output_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_video_unit_adoption_events` ADD CONSTRAINT `remake_video_unit_adoption_events_trackId_fkey` FOREIGN KEY (`trackId`) REFERENCES `remake_video_unit_tracks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_video_unit_adoption_events` ADD CONSTRAINT `remake_video_unit_adoption_events_previousVersionId_fkey` FOREIGN KEY (`previousVersionId`) REFERENCES `remake_video_unit_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_video_unit_adoption_events` ADD CONSTRAINT `remake_video_unit_adoption_events_nextVersionId_fkey` FOREIGN KEY (`nextVersionId`) REFERENCES `remake_video_unit_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_video_unit_action_sheets` ADD CONSTRAINT `remake_video_unit_action_sheets_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `remake_video_units`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
