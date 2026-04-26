import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import StoryboardPackageImportDialog from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/StoryboardPackageImportDialog'
import type { StoryboardPackageImportPreviewResult } from '@/lib/query/hooks'

const t = (key: string, values?: Record<string, unknown>) => {
  const map: Record<string, string> = {
    'storyboardPackageImport.preview.title': '导入分镜表预览',
    'storyboardPackageImport.preview.unknownFile': '未命名文件',
    'storyboardPackageImport.preview.loading': '正在解析分镜表...',
    'storyboardPackageImport.preview.segments': '片段',
    'storyboardPackageImport.preview.create': '新建',
    'storyboardPackageImport.preview.update': '覆盖',
    'storyboardPackageImport.preview.warnings': '提醒',
    'storyboardPackageImport.preview.overwrite': `将新建 ${values?.create} 个片段，覆盖 ${values?.update} 个已导入片段；默认保留已有生成媒体。`,
    'storyboardPackageImport.preview.actionCreate': '创建新片段',
    'storyboardPackageImport.preview.actionUpdate': '覆盖已导入片段',
    'storyboardPackageImport.preview.shots': `${values?.count} 个镜头`,
    'storyboardPackageImport.preview.assetMatched': '已匹配',
    'storyboardPackageImport.preview.assetFallback': '剧本回退',
    'storyboardPackageImport.preview.mediaPreserved': '已有生成媒体将默认保留。',
    'storyboardPackageImport.actions.cancel': '取消',
    'storyboardPackageImport.actions.confirm': '确认导入',
    'storyboardPackageImport.actions.importing': '正在导入...',
  }
  return map[key] || key
}

const preview: StoryboardPackageImportPreviewResult = {
  ok: true,
  mode: 'preview',
  overwriteStrategy: 'replace-imported',
  preserveGeneratedMedia: true,
  package: {
    packageId: 'pkg-1',
    title: '导演分镜包',
    language: 'zh',
    sceneCount: 1,
    segmentCount: 1,
  },
  summary: {
    totalSegments: 1,
    createCount: 1,
    updateCount: 0,
    warningCount: 1,
  },
  scenes: [{ sceneId: 'scene-1', title: '场景一', targetDurationSec: 15, directorIntent: '紧张', segmentIds: ['seg-1'] }],
  segments: [{
    packageId: 'pkg-1',
    sceneId: 'scene-1',
    segmentId: 'seg-1',
    action: 'create',
    existingShotGroupId: null,
    order: 1,
    title: '门口等待',
    sceneLabel: '旧公寓门口',
    targetDurationSec: 15,
    templateKey: 'grid-6',
    shotCount: 6,
    assetMatches: {
      location: [{
        assetType: 'location',
        ref: 'LOC_OLD',
        label: '旧公寓',
        matchName: '旧公寓',
        packageExternalId: 'LOC_OLD',
        status: 'matched',
        source: 'name',
        assetId: 'loc-1',
        assetName: '旧公寓',
        imageId: null,
        imageUrl: null,
        warning: null,
      }],
      characters: [],
      props: [{
        assetType: 'prop',
        ref: 'PROP_KEY',
        label: '钥匙',
        matchName: '钥匙',
        packageExternalId: 'PROP_KEY',
        status: 'script-derived-fallback',
        source: 'scriptDerived',
        assetId: null,
        assetName: null,
        imageId: null,
        imageUrl: null,
        warning: '物品素材未匹配：钥匙，将使用剧本文本回退。',
      }],
    },
    warnings: ['物品素材未匹配：钥匙，将使用剧本文本回退。'],
  }],
  warnings: ['物品素材未匹配：钥匙，将使用剧本文本回退。'],
}

function renderDialog(props: Partial<React.ComponentProps<typeof StoryboardPackageImportDialog>> = {}) {
  return renderToStaticMarkup(createElement(StoryboardPackageImportDialog, {
    preview,
    filename: 'package.md',
    isPreviewing: false,
    isCommitting: false,
    previewError: null,
    commitError: null,
    commitPayload: { content: '{}', filename: 'package.md' },
    onCancel: () => undefined,
    onConfirm: () => undefined,
    tScript: t,
    ...props,
  }))
}

function collectButtons(node: React.ReactNode): Array<React.ReactElement<{ onClick?: () => void; disabled?: boolean }>> {
  if (!React.isValidElement(node)) return []
  const current = node.type === 'button' ? [node as React.ReactElement<{ onClick?: () => void; disabled?: boolean }>] : []
  const children = React.Children.toArray((node.props as { children?: React.ReactNode }).children)
  return [...current, ...children.flatMap(collectButtons)]
}

describe('storyboard package upload ui', () => {
  it('renders preview segments, asset status, warning, and overwrite behavior', () => {
    const html = renderDialog()

    expect(html).toContain('导入分镜表预览')
    expect(html).toContain('门口等待')
    expect(html).toContain('旧公寓门口')
    expect(html).toContain('grid-6')
    expect(html).toContain('6 个镜头')
    expect(html).toContain('已匹配')
    expect(html).toContain('剧本回退')
    expect(html).toContain('默认保留已有生成媒体')
  })

  it('renders validation errors and disables confirm', () => {
    const failed: StoryboardPackageImportPreviewResult = {
      ok: false,
      error: { code: 'VALIDATION_FAILED', message: 'Storyboard package failed schema validation.', issues: [{ code: 'custom', path: 'scenes.0', message: 'bad scene' }] },
    }
    const html = renderDialog({ preview: failed })

    expect(html).toContain('Storyboard package failed schema validation.')
    expect(html).toContain('scenes.0')
    expect(html).toContain('disabled')
  })

  it('renders preview upload errors and disables confirm', () => {
    const html = renderDialog({ preview: null, previewError: '预览分镜表导入失败' })

    expect(html).toContain('预览分镜表导入失败')
    expect(html).toContain('disabled')
  })

  it('cancel does not call commit while confirm calls commit once', () => {
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    const tree = StoryboardPackageImportDialog({
      preview,
      filename: 'package.md',
      isPreviewing: false,
      isCommitting: false,
      previewError: null,
      commitError: null,
      commitPayload: { content: '{}', filename: 'package.md' },
      onCancel,
      onConfirm,
      tScript: t,
    })
    const buttons = collectButtons(tree)

    buttons[0].props.onClick?.()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()

    const confirm = buttons[buttons.length - 1]
    expect(confirm.props.disabled).toBe(false)
    confirm.props.onClick?.()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({ content: '{}', filename: 'package.md' })
  })
})
