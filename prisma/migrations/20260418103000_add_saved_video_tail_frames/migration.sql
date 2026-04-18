ALTER TABLE `novel_promotion_panels`
  ADD COLUMN `savedTailFrameUrl` TEXT NULL,
  ADD COLUMN `savedTailFrameMediaId` TEXT NULL,
  ADD CONSTRAINT `novel_promotion_panels_savedTailFrameMediaId_fkey`
    FOREIGN KEY (`savedTailFrameMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `novel_promotion_panels_savedTailFrameMediaId_idx`
  ON `novel_promotion_panels`(`savedTailFrameMediaId`);

ALTER TABLE `novel_promotion_shot_groups`
  ADD COLUMN `savedTailFrameUrl` TEXT NULL,
  ADD COLUMN `savedTailFrameMediaId` TEXT NULL,
  ADD CONSTRAINT `novel_promotion_shot_groups_savedTailFrameMediaId_fkey`
    FOREIGN KEY (`savedTailFrameMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `novel_promotion_shot_groups_savedTailFrameMediaId_idx`
  ON `novel_promotion_shot_groups`(`savedTailFrameMediaId`);
