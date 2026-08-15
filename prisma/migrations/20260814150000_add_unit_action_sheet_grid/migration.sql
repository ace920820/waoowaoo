-- Phase 09.3: draggable action-sheet x-grid layout for merged units.
-- { columns: number, cells: [{ shotNumber, slot, mediaId, timestamp }] }.
-- null = default auto layout (member original keyframes, 3x3).
ALTER TABLE remake_video_units ADD COLUMN actionSheetGrid JSON NULL;
