import { Prisma } from '@prisma/client'

export function buildEpisodeInProjectWhere(
  projectId: string,
  episodeId: string,
): Prisma.NovelPromotionEpisodeWhereInput {
  return {
    id: episodeId,
    novelPromotionProject: {
      projectId,
    },
  }
}

export function buildShotGroupInProjectWhere(
  projectId: string,
  shotGroupId: string,
): Prisma.NovelPromotionShotGroupWhereInput {
  return {
    id: shotGroupId,
    episode: {
      novelPromotionProject: {
        projectId,
      },
    },
  }
}

export function buildPanelInProjectWhere(
  projectId: string,
  panelId: string,
): Prisma.NovelPromotionPanelWhereInput {
  return {
    id: panelId,
    storyboard: {
      episode: {
        novelPromotionProject: {
          projectId,
        },
      },
    },
  }
}
