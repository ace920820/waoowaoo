ALTER TABLE `novel_promotion_episodes`
  ADD COLUMN `episodeProductionMode` VARCHAR(191) NOT NULL DEFAULT 'multi_shot';

UPDATE `novel_promotion_episodes`
SET `episodeProductionMode` = 'multi_shot';

UPDATE `novel_promotion_episodes` AS `episode`
SET `episodeProductionMode` = 'traditional'
WHERE EXISTS (
  SELECT 1
  FROM `novel_promotion_storyboards` AS `storyboard`
  INNER JOIN `novel_promotion_panels` AS `panel`
    ON `panel`.`storyboardId` = `storyboard`.`id`
  WHERE `storyboard`.`episodeId` = `episode`.`id`
)
OR EXISTS (
  SELECT 1
  FROM `novel_promotion_storyboards` AS `storyboard`
  INNER JOIN `novel_promotion_panels` AS `panel`
    ON `panel`.`storyboardId` = `storyboard`.`id`
  WHERE `storyboard`.`episodeId` = `episode`.`id`
    AND `panel`.`videoUrl` IS NOT NULL
    AND TRIM(`panel`.`videoUrl`) <> ''
);
