ALTER TABLE novel_promotion_projects
  ADD COLUMN storyboardMoodPresets TEXT NULL;

ALTER TABLE novel_promotion_panels
  ADD COLUMN storyboardMoodPresetId TEXT NULL,
  ADD COLUMN customMood TEXT NULL;
