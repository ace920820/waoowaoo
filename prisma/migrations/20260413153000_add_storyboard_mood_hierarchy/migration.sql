ALTER TABLE `novel_promotion_projects`
  ADD COLUMN `storyboardDefaultMoodPresetId` TEXT NULL;

ALTER TABLE `novel_promotion_episodes`
  ADD COLUMN `storyboardDefaultMoodPresetId` TEXT NULL;

ALTER TABLE `novel_promotion_clips`
  ADD COLUMN `storyboardMoodPresetId` TEXT NULL,
  ADD COLUMN `customMood` TEXT NULL;
