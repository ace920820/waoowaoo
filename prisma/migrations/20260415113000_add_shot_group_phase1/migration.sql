CREATE TABLE novel_promotion_shot_groups (
  id TEXT NOT NULL,
  episodeId TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '未命名镜头组',
  templateKey TEXT NOT NULL DEFAULT 'grid-4',
  groupPrompt TEXT NULL,
  referenceImageUrl TEXT NULL,
  referenceImageMediaId TEXT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT novel_promotion_shot_groups_episodeId_fkey FOREIGN KEY (episodeId) REFERENCES novel_promotion_episodes (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT novel_promotion_shot_groups_referenceImageMediaId_fkey FOREIGN KEY (referenceImageMediaId) REFERENCES media_objects (id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX novel_promotion_shot_groups_episodeId_idx ON novel_promotion_shot_groups (episodeId);
CREATE INDEX novel_promotion_shot_groups_referenceImageMediaId_idx ON novel_promotion_shot_groups (referenceImageMediaId);

CREATE TABLE novel_promotion_shot_group_items (
  id TEXT NOT NULL,
  shotGroupId TEXT NOT NULL,
  itemIndex INTEGER NOT NULL,
  title TEXT NULL,
  prompt TEXT NULL,
  imageUrl TEXT NULL,
  imageMediaId TEXT NULL,
  sourcePanelId TEXT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT novel_promotion_shot_group_items_shotGroupId_fkey FOREIGN KEY (shotGroupId) REFERENCES novel_promotion_shot_groups (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT novel_promotion_shot_group_items_imageMediaId_fkey FOREIGN KEY (imageMediaId) REFERENCES media_objects (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT novel_promotion_shot_group_items_sourcePanelId_fkey FOREIGN KEY (sourcePanelId) REFERENCES novel_promotion_panels (id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX novel_promotion_shot_group_items_shotGroupId_itemIndex_key ON novel_promotion_shot_group_items (shotGroupId, itemIndex);
CREATE INDEX novel_promotion_shot_group_items_shotGroupId_idx ON novel_promotion_shot_group_items (shotGroupId);
CREATE INDEX novel_promotion_shot_group_items_imageMediaId_idx ON novel_promotion_shot_group_items (imageMediaId);
CREATE INDEX novel_promotion_shot_group_items_sourcePanelId_idx ON novel_promotion_shot_group_items (sourcePanelId);
