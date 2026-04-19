import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MultiShotStoryboardStage from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage'

const mocks = vi.hoisted(() => ({
  useWorkspaceStageRuntimeMock: vi.fn(),
  useWorkspaceEpisodeStageDataMock: vi.fn(),
  useWorkspaceProviderMock: vi.fn(),
}))

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/WorkspaceStageRuntimeContext', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/WorkspaceStageRuntimeContext')
  >('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/WorkspaceStageRuntimeContext')

  return {
    ...actual,
    useWorkspaceStageRuntime: mocks.useWorkspaceStageRuntimeMock,
  }
})

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceEpisodeStageData', () => ({
  useWorkspaceEpisodeStageData: mocks.useWorkspaceEpisodeStageDataMock,
}))

vi.mock('@/app/[locale]/workspace/[projectId]/modes/novel-promotion/WorkspaceProvider', () => ({
  useWorkspaceProvider: mocks.useWorkspaceProviderMock,
}))

function createShotGroup(params: {
  id: string
  title: string
  compositeImageUrl?: string | null
  sourceStatus?: 'ready' | 'placeholder'
}) {
  return {
    id: params.id,
    episodeId: 'episode-1',
    title: params.title,
    templateKey: 'grid-9',
    groupPrompt: '镜头从远景切入，角色冲进雨夜巷口，动作、景别与情绪连续推进。',
    videoPrompt: '镜头从远景切入，角色冲进雨夜巷口，动作、景别与情绪连续推进。',
    includeDialogue: true,
    dialogueLanguage: 'zh',
    videoModel: 'model-1',
    compositeImageUrl: params.compositeImageUrl ?? null,
    videoUrl: null,
    createdAt: '2026-04-19T00:00:00.000Z',
    updatedAt: '2026-04-19T00:00:00.000Z',
    items: new Array(6).fill(null).map((_, index) => ({
      id: `${params.id}-item-${index + 1}`,
      shotGroupId: params.id,
      itemIndex: index + 1,
      title: `镜头 ${index + 1}`,
    })),
    videoReferencesJson: JSON.stringify({
      draftMetadata: {
        segmentOrder: params.id === 'group-1' ? 1 : 2,
        clipId: `clip-${params.id}`,
        sceneLabel: params.id === 'group-1' ? '天台夜战' : '旧仓库对峙',
        narrativePrompt: '适合模型直接生成的多镜头段落提示词',
        embeddedDialogue: '“别回头，往前跑。”',
        shotRhythmGuidance: '先压迫式近景，再切中景追拍，最后定格对视。',
        expectedShotCount: 6,
        sourceStatus: params.sourceStatus ?? 'ready',
        placeholderReason: params.sourceStatus === 'placeholder' ? 'missing_clip_content' : null,
      },
    }),
  }
}

function renderStage() {
  Reflect.set(globalThis, 'React', React)
  return renderToStaticMarkup(React.createElement(MultiShotStoryboardStage))
}

describe('multi-shot storyboard stage', () => {
  beforeEach(() => {
    mocks.useWorkspaceStageRuntimeMock.mockReset()
    mocks.useWorkspaceEpisodeStageDataMock.mockReset()
    mocks.useWorkspaceProviderMock.mockReset()

    mocks.useWorkspaceStageRuntimeMock.mockReturnValue({
      onStageChange: vi.fn(),
      videoModel: 'model-1',
      capabilityOverrides: {},
      userVideoModels: [],
    })
    mocks.useWorkspaceProviderMock.mockReturnValue({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })
    mocks.useWorkspaceEpisodeStageDataMock.mockReturnValue({
      shotGroups: [
        createShotGroup({ id: 'group-1', title: '片段 1', compositeImageUrl: null }),
        createShotGroup({ id: 'group-2', title: '片段 2', compositeImageUrl: '/ref.png' }),
        createShotGroup({ id: 'group-3', title: '片段 3', compositeImageUrl: null, sourceStatus: 'placeholder' }),
      ],
      clips: [],
      storyboards: [],
    })
  })

  it('states draft creation finished and video generation has not started', () => {
    const html = renderStage()

    expect(html).toContain('多镜头确认')
    expect(html).toContain('草稿创建已完成')
    expect(html).toContain('视频生成尚未开始')
    expect(html).toContain('进入 videos 前，必须逐段确认分镜参考')
  })

  it('shows per-segment reference confirmation affordances before videos', () => {
    const html = renderStage()

    expect(html).toContain('上传参考图')
    expect(html).toContain('生成参考板')
    expect(html).toContain('替换参考图')
    expect(html).toContain('替换参考板')
  })

  it('explains the segment payload model in review mode and omits generation CTAs', () => {
    const html = renderStage()

    expect(html).toContain('每个片段都是一个 15 秒视频生成单元')
    expect(html).toContain('最多承载 9 个镜头')
    expect(html).toContain('模型可直接使用的提示词')
    expect(html).toContain('嵌入对白')
    expect(html).toContain('镜头节奏')
    expect(html).not.toContain('创建并开始生成')
    expect(html).not.toContain('生成视频')
    expect(html).not.toContain('重新生成视频')
  })

  it('shows placeholder repair guidance for incomplete reserved segments', () => {
    const html = renderStage()

    expect(html).toContain('该片段槽位已预留')
    expect(html).toContain('提示词/参考输入仍不完整')
    expect(html).toContain('请先修复后再进入视频生成')
  })
})
