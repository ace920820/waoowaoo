-- Soft-delete support for RemakeVideoUnit (dissolve keeps assets).
ALTER TABLE `remake_video_units` ADD COLUMN `dissolvedAt` DATETIME(3) NULL,
  ADD COLUMN `dissolvedReason` TEXT NULL;
