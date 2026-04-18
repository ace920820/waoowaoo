ALTER TABLE `novel_promotion_shot_groups`
  ADD COLUMN `generateAudio` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `bgmEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `includeDialogue` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `dialogueLanguage` VARCHAR(191) NOT NULL DEFAULT 'zh',
  ADD COLUMN `omniReferenceEnabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `smartMultiFrameEnabled` BOOLEAN NOT NULL DEFAULT false;
