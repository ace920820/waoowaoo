import { describe, expect, it } from 'vitest'
import { buildShotGroupCompositePrompt } from '@/lib/shot-group/prompt'
import { getShotGroupTemplateSpec } from '@/lib/shot-group/template-registry'

describe('shot-group-image-task-handler helpers', () => {
  it('builds composite prompt from template and group prompt', () => {
    const template = getShotGroupTemplateSpec('grid-4')
    const prompt = buildShotGroupCompositePrompt({
      group: {
        id: 'group-1',
        episodeId: 'episode-1',
        title: '动作推进',
        templateKey: 'grid-4',
        groupPrompt: '同一空间内完成建立到收束',
        referenceImageUrl: null,
        compositeImageUrl: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [
          { id: 'item-1', shotGroupId: 'group-1', itemIndex: 0, title: '建立镜头' },
          { id: 'item-2', shotGroupId: 'group-1', itemIndex: 1, title: '关系镜头' },
        ],
      },
      template,
      artStyle: '电影感分镜风格',
      locale: 'zh',
    })

    expect(prompt).toContain('动作推进')
    expect(prompt).toContain('同一空间内完成建立到收束')
    expect(prompt).toContain('4 宫格')
    expect(prompt).toContain('建立镜头')
  })
})
