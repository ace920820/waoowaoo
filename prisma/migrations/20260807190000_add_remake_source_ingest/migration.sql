ALTER TABLE `remake_projects`
  ADD COLUMN `currentSourceId` VARCHAR(191) NULL;

ALTER TABLE `remake_sources`
  DROP INDEX `remake_sources_remakeProjectId_key`,
  ADD COLUMN `sourceRevision` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `operationKey` VARCHAR(191) NULL,
  ADD COLUMN `storageKey` VARCHAR(191) NULL,
  ADD COLUMN `fileName` VARCHAR(512) NULL,
  ADD COLUMN `contentType` VARCHAR(191) NULL,
  ADD COLUMN `byteSize` BIGINT NULL,
  ADD COLUMN `probeMetadata` LONGTEXT NULL,
  MODIFY COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'uploaded_pending',
  ADD UNIQUE INDEX `remake_sources_remakeProjectId_sourceRevision_key`(`remakeProjectId`, `sourceRevision`),
  ADD UNIQUE INDEX `remake_sources_remakeProjectId_operationKey_key`(`remakeProjectId`, `operationKey`),
  ADD INDEX `remake_sources_remakeProjectId_createdAt_idx`(`remakeProjectId`, `createdAt`);

ALTER TABLE `remake_shots`
  ADD COLUMN `currentRevision` INTEGER NULL,
  ADD COLUMN `version` INTEGER NOT NULL DEFAULT 0;

ALTER TABLE `remake_shot_revisions`
  ADD COLUMN `lifecycleState` VARCHAR(191) NOT NULL DEFAULT 'active',
  ADD COLUMN `sourceRevision` INTEGER NULL,
  ADD COLUMN `keyframeFrames` LONGTEXT NULL,
  ADD COLUMN `keyframeMediaRefs` LONGTEXT NULL,
  ADD COLUMN `analysisTaskId` VARCHAR(191) NULL,
  ADD COLUMN `keyframeTaskId` VARCHAR(191) NULL,
  ADD INDEX `remake_shot_revisions_sourceRevision_idx`(`sourceRevision`),
  ADD INDEX `remake_shot_revisions_analysisTaskId_idx`(`analysisTaskId`),
  ADD INDEX `remake_shot_revisions_keyframeTaskId_idx`(`keyframeTaskId`);

UPDATE `remake_projects` rp
JOIN `remake_sources` rs ON rs.`remakeProjectId` = rp.`id`
SET rp.`currentSourceId` = rs.`id`;

ALTER TABLE `remake_projects`
  ADD UNIQUE INDEX `remake_projects_currentSourceId_key`(`currentSourceId`),
  ADD CONSTRAINT `remake_projects_currentSourceId_fkey`
    FOREIGN KEY (`currentSourceId`) REFERENCES `remake_sources`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
