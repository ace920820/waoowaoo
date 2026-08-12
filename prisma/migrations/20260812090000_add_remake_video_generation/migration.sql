-- Durable append-only Remake video generation history.
ALTER TABLE `remake_provenance_records`
  ADD COLUMN `videoBatchId` VARCHAR(191) NULL;
CREATE INDEX `remake_provenance_records_videoBatchId_idx` ON `remake_provenance_records`(`videoBatchId`);

ALTER TABLE `remake_invalidations`
  ADD COLUMN `videoTrackId` VARCHAR(191) NULL,
  ADD COLUMN `videoBatchId` VARCHAR(191) NULL,
  ADD COLUMN `videoVersionId` VARCHAR(191) NULL;
CREATE INDEX `remake_invalidations_videoTrackId_idx` ON `remake_invalidations`(`videoTrackId`);
CREATE INDEX `remake_invalidations_videoBatchId_idx` ON `remake_invalidations`(`videoBatchId`);
CREATE INDEX `remake_invalidations_videoVersionId_idx` ON `remake_invalidations`(`videoVersionId`);

CREATE TABLE `remake_video_tracks` (
  `id` VARCHAR(191) NOT NULL,
  `shotRevisionId` VARCHAR(191) NOT NULL,
  `adoptedVersionId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `remake_video_tracks_adoptedVersionId_key` (`adoptedVersionId`),
  UNIQUE INDEX `remake_video_tracks_shotRevisionId_key` (`shotRevisionId`),
  INDEX `remake_video_tracks_shotRevisionId_idx` (`shotRevisionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_video_batches` (
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
  UNIQUE INDEX `remake_video_batches_trackId_operationKey_key` (`trackId`, `operationKey`),
  INDEX `remake_video_batches_promptVersionId_idx` (`promptVersionId`),
  INDEX `remake_video_batches_taskId_idx` (`taskId`),
  INDEX `remake_video_batches_inputFingerprint_idx` (`inputFingerprint`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_video_versions` (
  `id` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `outputVersionId` VARCHAR(191) NOT NULL,
  `ordinal` INTEGER NOT NULL,
  `note` TEXT NULL,
  `reviewerId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `remake_video_versions_outputVersionId_key` (`outputVersionId`),
  UNIQUE INDEX `remake_video_versions_batchId_ordinal_key` (`batchId`, `ordinal`),
  INDEX `remake_video_versions_batchId_createdAt_idx` (`batchId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_video_adoption_events` (
  `id` VARCHAR(191) NOT NULL,
  `trackId` VARCHAR(191) NOT NULL,
  `previousVersionId` VARCHAR(191) NULL,
  `nextVersionId` VARCHAR(191) NULL,
  `reviewerId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `remake_video_adoption_events_trackId_createdAt_idx` (`trackId`, `createdAt`),
  INDEX `remake_video_adoption_events_previousVersionId_idx` (`previousVersionId`),
  INDEX `remake_video_adoption_events_nextVersionId_idx` (`nextVersionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `remake_provenance_records` ADD CONSTRAINT `remake_provenance_records_videoBatchId_fkey` FOREIGN KEY (`videoBatchId`) REFERENCES `remake_video_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_invalidations` ADD CONSTRAINT `remake_invalidations_videoTrackId_fkey` FOREIGN KEY (`videoTrackId`) REFERENCES `remake_video_tracks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_invalidations` ADD CONSTRAINT `remake_invalidations_videoBatchId_fkey` FOREIGN KEY (`videoBatchId`) REFERENCES `remake_video_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_invalidations` ADD CONSTRAINT `remake_invalidations_videoVersionId_fkey` FOREIGN KEY (`videoVersionId`) REFERENCES `remake_video_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_video_tracks` ADD CONSTRAINT `remake_video_tracks_shotRevisionId_fkey` FOREIGN KEY (`shotRevisionId`) REFERENCES `remake_shot_revisions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_video_tracks` ADD CONSTRAINT `remake_video_tracks_adoptedVersionId_fkey` FOREIGN KEY (`adoptedVersionId`) REFERENCES `remake_video_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_video_batches` ADD CONSTRAINT `remake_video_batches_trackId_fkey` FOREIGN KEY (`trackId`) REFERENCES `remake_video_tracks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_video_batches` ADD CONSTRAINT `remake_video_batches_promptVersionId_fkey` FOREIGN KEY (`promptVersionId`) REFERENCES `remake_prompt_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_video_versions` ADD CONSTRAINT `remake_video_versions_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `remake_video_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_video_versions` ADD CONSTRAINT `remake_video_versions_outputVersionId_fkey` FOREIGN KEY (`outputVersionId`) REFERENCES `remake_output_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_video_adoption_events` ADD CONSTRAINT `remake_video_adoption_events_trackId_fkey` FOREIGN KEY (`trackId`) REFERENCES `remake_video_tracks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_video_adoption_events` ADD CONSTRAINT `remake_video_adoption_events_previousVersionId_fkey` FOREIGN KEY (`previousVersionId`) REFERENCES `remake_video_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_video_adoption_events` ADD CONSTRAINT `remake_video_adoption_events_nextVersionId_fkey` FOREIGN KEY (`nextVersionId`) REFERENCES `remake_video_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
