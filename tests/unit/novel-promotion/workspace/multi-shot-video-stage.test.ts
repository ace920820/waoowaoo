import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ShotGroupVideoSection, {
  buildShotGroupVideoDraftMetadataPatch,
} from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection'
import type { NovelPromotionShotGroup } from '@/types/project'

const mocks = vi.hoisted(() => ({
  useCreateProjectShotGroupMock: vi.fn(),
  useUpdateProjectShotGroupMock: vi.fn(),
  useUploadProjectShotGroupReferenceImageMock: vi.fn(),
  useGenerateProjectShotGroupVideoMock: vi.fn(),
  useSaveProjectVideoTailFrameMock: vi.fn(),
  useDownloadRemoteBlobMock: vi.fn(),
  useTaskTargetStateMapMock: vi.fn(),
}))

vi.mock('@/lib/query/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/query/hooks')>('@/lib/query/hooks')
  return {
    ...actual,
    useCreateProjectShotGroup: mocks.useCreateProjectShotGroupMock,
    useUpdateProjectShotGroup: mocks.useUpdateProjectShotGroupMock,
    useUploadProjectShotGroupReferenceImage: mocks.useUploadProjectShotGroupReferenceImageMock,
    useGenerateProjectShotGroupVideo: mocks.useGenerateProjectShotGroupVideoMock,
    useSaveProjectVideoTailFrame: mocks.useSaveProjectVideoTailFrameMock,
    useDownloadRemoteBlob: mocks.useDownloadRemoteBlobMock,
    useTaskTargetStateMap: mocks.useTaskTargetStateMapMock,
  }
})

vi.mock('@/components/ui/config-modals/ModelCapabilityDropdown', () => ({
  ModelCapabilityDropdown: () => React.createElement('div', { 'data-ui': 'model-capability-dropdown' }),
}))

vi.mock('@/components/task/TaskStatusInline', () => ({
  default: () => React.createElement('div', { 'data-ui': 'task-status-inline' }),
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name }: { name: string }) => React.createElement('span', { 'data-icon': name }),
}))

vi.mock('@/components/ui/primitives', () => ({
  GlassButton: ({ children, ...props }: React.ComponentProps<'button'>) => React.createElement('button', props, children),
}))

vi.mock('@/components/ui/primitives/GlassModalShell', () => ({
  default: ({ open, children }: { open: boolean; children?: React.ReactNode }) => (
    open ? React.createElement('div', { 'data-ui': 'glass-modal-shell' }, children) : null
  ),
}))

function createShotGroup(params?: {
  id?: string
  title?: string
  embeddedDialogue?: string | null
  dialogueOverrideText?: string | null
}): NovelPromotionShotGroup {
  return {
    id: params?.id ?? 'group-1',
    episodeId: 'episode-1',
    title: params?.title ?? '片段 1',
    templateKey: 'grid-9',
    groupPrompt: '镜头从雨夜巷口推进到角色停步回望。',
    videoPrompt: '镜头从雨夜巷口推进到角色停步回望。',
    includeDialogue: true,
    dialogueLanguage: 'zh',
    videoModel: 'model-1',
    compositeImageUrl: '/shot-group-preview.png',
    referenceImageUrl: '/reference.png',
    videoUrl: null,
    createdAt: '2026-04-19T00:00:00.000Z',
    updatedAt: '2026-04-19T00:00:00.000Z',
    items: new Array(9).fill(null).map((_, index) => ({
      id: `${params?.id ?? 'group-1'}-item-${index + 1}`,
      shotGroupId: params?.id ?? 'group-1',
      itemIndex: index,
      title: `镜头 ${index + 1}`,
    })),
    videoReferencesJson: JSON.stringify({
      draftMetadata: {
        segmentOrder: 1,
        clipId: 'clip-1',
        segmentKey: `${params?.id ?? 'group-1'}:1`,
        sourceClipId: 'clip-1',
        segmentIndexWithinClip: 1,
        segmentStartSeconds: 0,
        segmentEndSeconds: 15,
        sceneLabel: '雨夜街口',
        narrativePrompt: '适合模型直接生成的多镜头段落提示词',
        embeddedDialogue: params?.embeddedDialogue ?? '“别回头，继续走。”',
        dialogueOverrideText: params?.dialogueOverrideText ?? null,
        shotRhythmGuidance: '先远景建立，再中景推进，最后切角色特写。',
        expectedShotCount: 9,
        sourceStatus: 'ready',
        placeholderReason: null,
      },
    }),
  }
}

function renderShotGroupSection(props: React.ComponentProps<typeof ShotGroupVideoSection>) {
  const queryClient = new QueryClient()
  return renderToStaticMarkup(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(ShotGroupVideoSection, props),
    ),
  )
}

describe('multi-shot video stage', () => {
  beforeEach(() => {
    mocks.useCreateProjectShotGroupMock.mockReset()
    mocks.useUpdateProjectShotGroupMock.mockReset()
    mocks.useUploadProjectShotGroupReferenceImageMock.mockReset()
    mocks.useGenerateProjectShotGroupVideoMock.mockReset()
    mocks.useSaveProjectVideoTailFrameMock.mockReset()
    mocks.useDownloadRemoteBlobMock.mockReset()
    mocks.useTaskTargetStateMapMock.mockReset()

    mocks.useCreateProjectShotGroupMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(async (payload: unknown) => payload),
    })
    mocks.useUpdateProjectShotGroupMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(async (payload: unknown) => payload),
    })
    mocks.useUploadProjectShotGroupReferenceImageMock.mockReturnValue({
      isPending: false,
      variables: null,
      mutateAsync: vi.fn(async (payload: unknown) => payload),
    })
    mocks.useGenerateProjectShotGroupVideoMock.mockReturnValue({
      isPending: false,
      variables: null,
      mutateAsync: vi.fn(async (payload: unknown) => payload),
    })
    mocks.useSaveProjectVideoTailFrameMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(async (payload: unknown) => payload),
    })
    mocks.useDownloadRemoteBlobMock.mockReturnValue({
      isPending: false,
      mutateAsync: vi.fn(async () => new Blob()),
    })
    mocks.useTaskTargetStateMapMock.mockReturnValue({
      data: [],
    })
  })

  it('renders editable shot-group units on entry', () => {
    const html = renderShotGroupSection({
      projectId: 'project-1',
      episodeId: 'episode-1',
      shotGroups: [
        createShotGroup({ id: 'group-1', title: '片段 1' }),
        createShotGroup({ id: 'group-2', title: '片段 2', embeddedDialogue: null }),
      ],
      defaultVideoModel: 'model-1',
      videoModelOptions: [{ value: 'model-1', label: 'model-1' }],
      capabilityOverrides: {},
      mode: 'video',
    })

    expect(html).toContain('片段 1')
    expect(html).toContain('片段 2')
    expect(html).toContain('视频提示词')
    expect(html).toContain('台词 / 说话内容')
    expect(html).toContain('已从剧本草稿带入，可在生成前直接改写或清空。')
    expect(html).toContain('可选。留空时按当前生产单元的默认语音内容处理。')
  })

  it('does not render dialogue editors in review mode', () => {
    const html = renderShotGroupSection({
      projectId: 'project-1',
      episodeId: 'episode-1',
      shotGroups: [createShotGroup()],
      defaultVideoModel: 'model-1',
      videoModelOptions: [{ value: 'model-1', label: 'model-1' }],
      capabilityOverrides: {},
      mode: 'review',
    })

    expect(html).not.toContain('台词 / 说话内容')
    expect(html).not.toContain('已从剧本草稿带入，可在生成前直接改写或清空。')
    expect(html).toContain('多镜头确认')
  })

  it('saves dialogueOverrideText as null when cleared', () => {
    expect(buildShotGroupVideoDraftMetadataPatch({
      group: createShotGroup(),
      draft: {
        dialogueText: '',
        embeddedDialogue: '“别回头，继续走。”',
      },
    })).toEqual({
      dialogueOverrideText: null,
    })

    expect(buildShotGroupVideoDraftMetadataPatch({
      group: createShotGroup(),
      draft: {
        dialogueText: '“别回头，继续走。”',
        embeddedDialogue: '“别回头，继续走。”',
      },
    })).toEqual({
      dialogueOverrideText: null,
    })
  })
})
