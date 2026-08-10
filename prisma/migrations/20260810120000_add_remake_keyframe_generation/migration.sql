-- Durable append-only Remake keyframe generation history.
ALTER TABLE `remake_output_versions`
  ADD COLUMN `kind` VARCHAR(191) NOT NULL DEFAULT 'generated',
  ADD COLUMN `fingerprint` VARCHAR(191) NULL,
  ADD COLUMN `taskId` VARCHAR(191) NULL,
  ADD COLUMN `inputSnapshot` JSON NULL,
  ADD COLUMN `invalidatedAt` DATETIME(3) NULL;
CREATE UNIQUE INDEX `remake_output_versions_revisionId_kind_fingerprint_key` ON `remake_output_versions`(`revisionId`, `kind`, `fingerprint`);
CREATE INDEX `remake_output_versions_taskId_idx` ON `remake_output_versions`(`taskId`);

ALTER TABLE `remake_provenance_records`
  ADD COLUMN `outputVersionId` VARCHAR(191) NULL,
  ADD COLUMN `keyframeBatchId` VARCHAR(191) NULL;
CREATE INDEX `remake_provenance_records_outputVersionId_idx` ON `remake_provenance_records`(`outputVersionId`);
CREATE INDEX `remake_provenance_records_keyframeBatchId_idx` ON `remake_provenance_records`(`keyframeBatchId`);

ALTER TABLE `remake_invalidations`
  ADD COLUMN `keyframeTrackId` VARCHAR(191) NULL,
  ADD COLUMN `keyframeBatchId` VARCHAR(191) NULL,
  ADD COLUMN `keyframeCandidateId` VARCHAR(191) NULL;
CREATE INDEX `remake_invalidations_keyframeTrackId_idx` ON `remake_invalidations`(`keyframeTrackId`);
CREATE INDEX `remake_invalidations_keyframeBatchId_idx` ON `remake_invalidations`(`keyframeBatchId`);
CREATE INDEX `remake_invalidations_keyframeCandidateId_idx` ON `remake_invalidations`(`keyframeCandidateId`);

CREATE TABLE `remake_keyframe_tracks` (
  `id` VARCHAR(191) NOT NULL,
  `shotRevisionId` VARCHAR(191) NOT NULL,
  `slot` VARCHAR(191) NOT NULL,
  `selectedForGeneration` BOOLEAN NOT NULL DEFAULT false,
  `adoptedCandidateId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `remake_keyframe_tracks_adoptedCandidateId_key` (`adoptedCandidateId`),
  UNIQUE INDEX `remake_keyframe_tracks_shotRevisionId_slot_key` (`shotRevisionId`, `slot`),
  INDEX `remake_keyframe_tracks_shotRevisionId_selectedForGeneration_idx` (`shotRevisionId`, `selectedForGeneration`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_keyframe_batches` (
  `id` VARCHAR(191) NOT NULL,
  `trackId` VARCHAR(191) NOT NULL,
  `promptVersionId` VARCHAR(191) NULL,
  `taskId` VARCHAR(191) NULL,
  `operationKey` VARCHAR(191) NOT NULL,
  `inputFingerprint` VARCHAR(191) NOT NULL,
  `inputSnapshot` JSON NOT NULL,
  `modelId` VARCHAR(191) NOT NULL,
  `modelOptions` JSON NOT NULL,
  `referenceMediaIds` JSON NOT NULL,
  `requestedCandidateCount` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `remake_keyframe_batches_trackId_operationKey_key` (`trackId`, `operationKey`),
  INDEX `remake_keyframe_batches_promptVersionId_idx` (`promptVersionId`),
  INDEX `remake_keyframe_batches_taskId_idx` (`taskId`),
  INDEX `remake_keyframe_batches_inputFingerprint_idx` (`inputFingerprint`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_keyframe_candidates` (
  `id` VARCHAR(191) NOT NULL,
  `batchId` VARCHAR(191) NOT NULL,
  `outputVersionId` VARCHAR(191) NOT NULL,
  `ordinal` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `remake_keyframe_candidates_outputVersionId_key` (`outputVersionId`),
  UNIQUE INDEX `remake_keyframe_candidates_batchId_ordinal_key` (`batchId`, `ordinal`),
  INDEX `remake_keyframe_candidates_batchId_createdAt_idx` (`batchId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_keyframe_adoption_events` (
  `id` VARCHAR(191) NOT NULL,
  `trackId` VARCHAR(191) NOT NULL,
  `previousCandidateId` VARCHAR(191) NULL,
  `nextCandidateId` VARCHAR(191) NULL,
  `reviewerId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `remake_keyframe_adoption_events_trackId_createdAt_idx` (`trackId`, `createdAt`),
  INDEX `remake_keyframe_adoption_events_previousCandidateId_idx` (`previousCandidateId`),
  INDEX `remake_keyframe_adoption_events_nextCandidateId_idx` (`nextCandidateId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `remake_provenance_records` ADD CONSTRAINT `remake_provenance_records_outputVersionId_fkey` FOREIGN KEY (`outputVersionId`) REFERENCES `remake_output_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_provenance_records` ADD CONSTRAINT `remake_provenance_records_keyframeBatchId_fkey` FOREIGN KEY (`keyframeBatchId`) REFERENCES `remake_keyframe_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_invalidations` ADD CONSTRAINT `remake_invalidations_outputVersionId_fkey` FOREIGN KEY (`outputVersionId`) REFERENCES `remake_output_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_invalidations` ADD CONSTRAINT `remake_invalidations_keyframeTrackId_fkey` FOREIGN KEY (`keyframeTrackId`) REFERENCES `remake_keyframe_tracks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_invalidations` ADD CONSTRAINT `remake_invalidations_keyframeBatchId_fkey` FOREIGN KEY (`keyframeBatchId`) REFERENCES `remake_keyframe_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_invalidations` ADD CONSTRAINT `remake_invalidations_keyframeCandidateId_fkey` FOREIGN KEY (`keyframeCandidateId`) REFERENCES `remake_keyframe_candidates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_keyframe_tracks` ADD CONSTRAINT `remake_keyframe_tracks_shotRevisionId_fkey` FOREIGN KEY (`shotRevisionId`) REFERENCES `remake_shot_revisions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_keyframe_tracks` ADD CONSTRAINT `remake_keyframe_tracks_adoptedCandidateId_fkey` FOREIGN KEY (`adoptedCandidateId`) REFERENCES `remake_keyframe_candidates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_keyframe_batches` ADD CONSTRAINT `remake_keyframe_batches_trackId_fkey` FOREIGN KEY (`trackId`) REFERENCES `remake_keyframe_tracks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_keyframe_batches` ADD CONSTRAINT `remake_keyframe_batches_promptVersionId_fkey` FOREIGN KEY (`promptVersionId`) REFERENCES `remake_prompt_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_keyframe_candidates` ADD CONSTRAINT `remake_keyframe_candidates_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `remake_keyframe_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_keyframe_candidates` ADD CONSTRAINT `remake_keyframe_candidates_outputVersionId_fkey` FOREIGN KEY (`outputVersionId`) REFERENCES `remake_output_versions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_keyframe_adoption_events` ADD CONSTRAINT `remake_keyframe_adoption_events_trackId_fkey` FOREIGN KEY (`trackId`) REFERENCES `remake_keyframe_tracks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_keyframe_adoption_events` ADD CONSTRAINT `remake_keyframe_adoption_events_previousCandidateId_fkey` FOREIGN KEY (`previousCandidateId`) REFERENCES `remake_keyframe_candidates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_keyframe_adoption_events` ADD CONSTRAINT `remake_keyframe_adoption_events_nextCandidateId_fkey` FOREIGN KEY (`nextCandidateId`) REFERENCES `remake_keyframe_candidates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
