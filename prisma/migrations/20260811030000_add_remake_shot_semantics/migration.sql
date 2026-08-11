-- Add shot-level semantics to RemakeShot: shot type, camera move, description,
-- mood preset, custom mood, scene tag, and character tags.
ALTER TABLE `remake_shots`
  ADD COLUMN `shotType` TEXT NULL,
  ADD COLUMN `cameraMove` TEXT NULL,
  ADD COLUMN `description` TEXT NULL,
  ADD COLUMN `moodPresetId` VARCHAR(191) NULL,
  ADD COLUMN `customMood` TEXT NULL,
  ADD COLUMN `sceneTag` VARCHAR(191) NULL,
  ADD COLUMN `characterTags` TEXT NULL;
