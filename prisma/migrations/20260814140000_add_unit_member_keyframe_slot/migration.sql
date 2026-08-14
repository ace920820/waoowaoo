-- Phase 09.2: per-member preferred keyframe slot for unit references (D-06).
-- null = default middle-priority with fallback; explicit start|middle|end pins
-- the adopted keyframe slot that member contributes to the merged video.
ALTER TABLE remake_video_unit_members ADD COLUMN keyframeSlot VARCHAR(16) NULL;
