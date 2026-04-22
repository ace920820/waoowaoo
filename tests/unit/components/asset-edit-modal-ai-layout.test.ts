import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'

vi.mock('@/components/ui/icons', () => ({
  AppIcon: (props: { className?: string }) => createElement('span', { className: props.className }),
}))

vi.mock('@/components/task/TaskStatusInline', () => ({
  default: () => createElement('span', null, 'loading'),
}))

vi.mock('@/lib/task/presentation', () => ({
  resolveTaskPresentationState: () => null,
}))

vi.mock('@/lib/query/hooks', () => ({
  useUpdateCharacterName: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateProjectCharacterName: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateCharacterAppearanceDescription: () => ({ mutateAsync: vi.fn() }),
  useGenerateCharacterImageFromReference: () => ({ mutateAsync: vi.fn() }),
  useUploadCharacterImage: () => ({ mutateAsync: vi.fn() }),
  useUploadAssetHubTempMedia: () => ({ mutateAsync: vi.fn() }),
  useUpdateProjectAppearanceDescription: () => ({ mutateAsync: vi.fn() }),
  useUpdateProjectCharacterIntroduction: () => ({ mutateAsync: vi.fn() }),
  useAiModifyCharacterDescription: () => ({ mutateAsync: vi.fn() }),
  useAiModifyProjectAppearanceDescription: () => ({ mutateAsync: vi.fn() }),
  useUpdateLocationName: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateProjectLocationName: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateLocationSummary: () => ({ mutateAsync: vi.fn() }),
  useUpdateProjectLocationDescription: () => ({ mutateAsync: vi.fn() }),
  useAiModifyLocationDescription: () => ({ mutateAsync: vi.fn() }),
  useAiModifyProjectLocationDescription: () => ({ mutateAsync: vi.fn() }),
  useAiModifyPropDescription: () => ({ mutateAsync: vi.fn() }),
  useAiModifyProjectPropDescription: () => ({ mutateAsync: vi.fn() }),
  useAssetActions: () => ({
    update: vi.fn(),
    updateVariant: vi.fn(),
    generate: vi.fn(),
  }),
}))

vi.mock('@/lib/image-generation/use-image-generation-count', () => ({
  useImageGenerationCount: () => ({
    count: 3,
    setCount: vi.fn(),
  }),
}))

const messages = {
  assets: {
    common: {
      cancel: '取消',
    },
    character: {
      name: '角色名',
      appearance: '形象',
    },
    location: {
      name: '场景名',
      description: '场景描述',
    },
    prop: {
      name: '道具名',
      summary: '简要说明',
      summaryPlaceholder: '一句话说明这是什么道具，不写剧情用途',
      description: '图片描述',
      descriptionPlaceholder: '只写道具本体的材质、颜色、结构和装饰细节',
    },
    modal: {
      editCharacter: '编辑角色',
      editLocation: '编辑场景',
      editProp: '编辑道具',
      referenceImagesTitle: '人物概念图',
      referenceImagesHint: '上传概念图后，保存时会结合当前角色描述与画风重新生成设定图和三视图。',
      referenceGenerateCount: '生成张数',
      referenceImageAlt: '概念图',
      referenceSelectedCount: '已选择 {count}/5 张概念图',
      referenceDropOrClick: '点击上传或拖拽人物概念图',
      referenceMaxImages: '最多上传 5 张概念图',
      saveAndUploadTriptych: '保存并上传三视图',
      saveAndGenerateFromReference: '保存并根据概念图生成',
      artStyle: '画面风格',
      namePlaceholder: '输入名称',
      appearancePrompt: '形象描述提示词',
      descPlaceholder: '输入描述',
      modifyDescription: 'AI修改描述',
      modifyPlaceholder: '改成夜晚',
      modifyPlaceholderCharacter: '改成黑色西装',
      modifyPlaceholderProp: '改成磨砂银质',
      saveName: '保存名字',
      saveOnly: '仅保存',
      saveAndGenerate: '保存并生成',
      introduction: '角色介绍',
      introductionPlaceholder: '输入角色介绍',
      introductionTip: '介绍角色在故事中的身份',
    },
    smartImport: {
      preview: {
        saving: '保存中',
      },
    },
    errors: {
      saveFailed: '保存失败',
      failed: '失败',
    },
    image: {
      uploadFailed: '上传失败',
    },
  },
} as const

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string
  messages: AbstractIntlMessages
  timeZone: string
  children?: React.ReactNode
}>

function renderWithMessages(node: React.ReactElement) {
  return renderToStaticMarkup(
    createElement(
      TestIntlProvider,
      {
        locale: 'zh',
        messages: messages as unknown as AbstractIntlMessages,
        timeZone: 'Asia/Shanghai',
      },
      node,
    ),
  )
}

describe('asset edit modal AI layout', () => {
  it('renders character AI modify action inside the description composer instead of a standalone smart-modify card', async () => {
    Reflect.set(globalThis, 'React', React)
    const { CharacterEditModal } = await import('@/components/shared/assets/CharacterEditModal')
    const html = renderWithMessages(
      createElement(CharacterEditModal, {
        mode: 'project',
        characterId: 'character-1',
        characterName: '沈烬',
        description: '冷峻禁欲的男性角色形象描述',
        appearanceId: 'appearance-1',
        onClose: () => undefined,
        onSave: () => undefined,
      }),
    )

    expect(html).toContain('AI修改描述')
    expect(html).not.toContain('改成黑色西装')
    expect(html).not.toContain('智能修改')
  })

  it('renders concept-image generation controls for asset-hub character editing', async () => {
    Reflect.set(globalThis, 'React', React)
    const { CharacterEditModal } = await import('@/components/shared/assets/CharacterEditModal')
    const html = renderWithMessages(
      createElement(CharacterEditModal, {
        mode: 'asset-hub',
        characterId: 'character-1',
        characterName: '沈烬',
        description: '冷峻禁欲的男性角色形象描述',
        appearanceId: 'appearance-1',
        appearanceIndex: 0,
        artStyle: 'american-comic',
        changeReason: '初始形象',
        onClose: () => undefined,
        onSave: () => undefined,
      }),
    )

    expect(html).toContain('人物概念图')
    expect(html).toContain('保存并生成')
    expect(html).toContain('保存并上传三视图')
  })

  it('renders prop AI modify action with the prop-specific placeholder', async () => {
    Reflect.set(globalThis, 'React', React)
    const { PropEditModal } = await import('@/components/shared/assets/PropEditModal')
    const html = renderWithMessages(
      createElement(PropEditModal, {
        mode: 'project',
        propId: 'prop-1',
        propName: '遗物匕首',
        summary: '旧时代留下的金属短刃',
        description: '青铜短刃，刃面斑驳，手柄有细密雕纹',
        variantId: 'prop-variant-1',
        projectId: 'project-1',
        onClose: () => undefined,
      }),
    )

    expect(html).toContain('AI修改描述')
    expect(html).not.toContain('改成磨砂银质')
    expect(html).not.toContain('智能修改')
  })
})
