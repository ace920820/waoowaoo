ALTER TABLE `novel_promotion_shot_groups`
  ADD COLUMN `videoPrompt` TEXT NULL,
  ADD COLUMN `videoModel` VARCHAR(191) NULL,
  ADD COLUMN `videoSourceType` VARCHAR(191) NULL,
  ADD COLUMN `videoReferencesJson` TEXT NULL,
  ADD COLUMN `videoUrl` TEXT NULL;
