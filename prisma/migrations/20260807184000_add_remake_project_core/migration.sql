ALTER TABLE `projects`
  ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'novel_promotion';

CREATE TABLE `remake_projects` (
  `id` VARCHAR(191) NOT NULL,
  `projectId` VARCHAR(191) NOT NULL,
  `creationRequestId` VARCHAR(191) NOT NULL,
  `importStatus` VARCHAR(191) NOT NULL DEFAULT 'not_imported',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `remake_projects_projectId_key`(`projectId`),
  UNIQUE INDEX `remake_projects_creationRequestId_key`(`creationRequestId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_sources` (
  `id` VARCHAR(191) NOT NULL,
  `remakeProjectId` VARCHAR(191) NOT NULL,
  `mediaId` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'not_imported',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `remake_sources_remakeProjectId_key`(`remakeProjectId`),
  INDEX `remake_sources_mediaId_idx`(`mediaId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_shots` (
  `id` VARCHAR(191) NOT NULL,
  `remakeProjectId` VARCHAR(191) NOT NULL,
  `stableKey` VARCHAR(191) NOT NULL,
  `externalIdentity` VARCHAR(191) NULL,
  `sequence` INTEGER NULL,
  `reviewStatus` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `needsReview` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `remake_shots_remakeProjectId_stableKey_key`(`remakeProjectId`, `stableKey`),
  UNIQUE INDEX `remake_shots_remakeProjectId_externalIdentity_key`(`remakeProjectId`, `externalIdentity`),
  INDEX `remake_shots_remakeProjectId_sequence_idx`(`remakeProjectId`, `sequence`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_shot_revisions` (
  `id` VARCHAR(191) NOT NULL,
  `shotId` VARCHAR(191) NOT NULL,
  `revision` INTEGER NOT NULL,
  `changeReason` VARCHAR(191) NOT NULL,
  `payload` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `remake_shot_revisions_shotId_revision_key`(`shotId`, `revision`),
  INDEX `remake_shot_revisions_shotId_idx`(`shotId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_output_versions` (
  `id` VARCHAR(191) NOT NULL,
  `shotId` VARCHAR(191) NOT NULL,
  `revisionId` VARCHAR(191) NULL,
  `outputVersionId` VARCHAR(191) NULL,
  `mediaId` VARCHAR(191) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `remake_output_versions_shotId_idx`(`shotId`),
  INDEX `remake_output_versions_revisionId_idx`(`revisionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_provenance_records` (
  `id` VARCHAR(191) NOT NULL,
  `shotId` VARCHAR(191) NOT NULL,
  `schema` VARCHAR(191) NOT NULL,
  `executor` VARCHAR(191) NULL,
  `capability` VARCHAR(191) NULL,
  `payload` LONGTEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `remake_provenance_records_shotId_idx`(`shotId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `remake_invalidations` (
  `id` VARCHAR(191) NOT NULL,
  `shotId` VARCHAR(191) NOT NULL,
  `revisionId` VARCHAR(191) NULL,
  `reason` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'needs_review',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `remake_invalidations_shotId_idx`(`shotId`),
  INDEX `remake_invalidations_revisionId_idx`(`revisionId`),
  INDEX `remake_invalidations_outputVersionId_idx`(`outputVersionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `remake_projects` ADD CONSTRAINT `remake_projects_projectId_fkey`
  FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_sources` ADD CONSTRAINT `remake_sources_remakeProjectId_fkey`
  FOREIGN KEY (`remakeProjectId`) REFERENCES `remake_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_shots` ADD CONSTRAINT `remake_shots_remakeProjectId_fkey`
  FOREIGN KEY (`remakeProjectId`) REFERENCES `remake_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_shot_revisions` ADD CONSTRAINT `remake_shot_revisions_shotId_fkey`
  FOREIGN KEY (`shotId`) REFERENCES `remake_shots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_output_versions` ADD CONSTRAINT `remake_output_versions_shotId_fkey`
  FOREIGN KEY (`shotId`) REFERENCES `remake_shots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_output_versions` ADD CONSTRAINT `remake_output_versions_revisionId_fkey`
  FOREIGN KEY (`revisionId`) REFERENCES `remake_shot_revisions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `remake_provenance_records` ADD CONSTRAINT `remake_provenance_records_shotId_fkey`
  FOREIGN KEY (`shotId`) REFERENCES `remake_shots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `remake_invalidations` ADD CONSTRAINT `remake_invalidations_shotId_fkey`
  FOREIGN KEY (`shotId`) REFERENCES `remake_shots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
