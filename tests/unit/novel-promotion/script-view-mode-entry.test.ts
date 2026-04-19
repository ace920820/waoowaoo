import * as React from 'react'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ScriptViewAssetsPanel from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel'

function renderPanel(mode: 'multi_shot' | 'traditional') {
  Reflect.set(globalThis, 'React', React)

  return renderToStaticMarkup(
    createElement(ScriptViewAssetsPanel, {
      clips: [{ id: 'clip-1', location: null, props: null }],
      assetViewMode: 'all',
      setAssetViewMode: () => undefined,
      setSelectedClipId: () => undefined,
      characters: [],
      locations: [],
      props: [],
      activeCharIds: [],
      activeLocationIds: [],
      activePropIds: [],
      selectedAppearanceKeys: new Set<string>(),
      onUpdateClipAssets: async () => undefined,
      onOpenAssetLibrary: () => undefined,
      assetsLoading: false,
      assetsLoadingState: null,
      allAssetsHaveImages: true,
      globalCharIds: [],
      globalLocationIds: [],
      missingAssetsCount: 0,
      episodeProductionMode: mode,
      onEpisodeProductionModeChange: async () => undefined,
      onGenerateStoryboard: () => undefined,
      isSubmittingStoryboardBuild: false,
      canGenerateStoryboardText: true,
      getSelectedAppearances: () => [],
      tScript: (key: string) => {
        const map: Record<string, string> = {
          'asset.activeCharacters': '出场角色',
          'asset.activeLocations': '出场场景',
          'asset.defaultAppearance': '默认形象',
          'screenplay.noCharacter': '暂无角色信息',
          'screenplay.noLocation': '暂无出场场景',
          'generate.startGenerate': '确认并开始绘制 →',
          'productionMode.title': '生产模式',
          'productionMode.subtitle': '请在开始绘制前，确认本集要走的生产路径',
          'productionMode.badge.multiShot': '默认更快路径',
          'productionMode.badge.traditional': '传统逐镜头路径',
          'productionMode.options.multiShot.label': '多镜头片段模式',
          'productionMode.options.multiShot.description': '跳过传统冗长分镜剧本，直接进入多镜头片段生产路径',
          'productionMode.options.traditional.label': '传统模式',
          'productionMode.options.traditional.description': '保留经典分镜链路，适合需要逐镜头精细控制的项目',
          'productionMode.helper.multiShot.title': '当前将直接进入多镜头片段生产',
          'productionMode.helper.multiShot.description': '点击下方按钮后，系统会自动创建多镜头草稿，打开多镜头确认，并在继续后进入视频阶段。',
          'productionMode.helper.multiShot.model': '草稿由当前剧集的片段结构自动整理而来，常见一集约 8 个 15 秒片段，每段就是一个视频生成单元；先确认参考，再继续进入 videos。',
          'productionMode.helper.traditional.title': '当前将进入传统分镜生成',
          'productionMode.helper.traditional.description': '点击下方按钮后，将继续执行剧本到分镜的传统生成链路。',
          'productionMode.cta.multiShot': '当前模式：多镜头片段模式，下一步会自动创建多镜头草稿并打开多镜头确认；确认参考后继续后进入视频。',
          'productionMode.cta.traditional': '当前模式：传统模式，下一步会生成传统分镜内容。',
        }
        return map[key] || key
      },
      tAssets: (key: string) => (key === 'character.primary' ? '初始形象' : key),
      tNP: (key: string) => key,
      tCommon: (key: string) => key,
    }),
  )
}

describe('script view mode entry', () => {
  it('renders multi-shot copy as draft creation plus confirmation instead of direct video entry', () => {
    const html = renderPanel('multi_shot')

    expect(html).toContain('生产模式')
    expect(html).toContain('多镜头片段模式')
    expect(html).toContain('传统模式')
    expect(html).toContain('确认并开始绘制 →')
    expect(html).toContain('自动创建多镜头草稿')
    expect(html).toContain('打开多镜头确认')
    expect(html).toContain('片段结构')
    expect(html).toContain('8 个')
    expect(html).toContain('15 秒')
    expect(html).toContain('继续后进入视频')
    expect(html).not.toContain('直接前往多镜头片段视频生产界面')
    expect(html).not.toContain('下一步会直接进入多镜头片段视频生产。')
  })

  it('keeps the traditional storyboard wording for traditional mode', () => {
    const html = renderPanel('traditional')

    expect(html).toContain('传统逐镜头路径')
    expect(html).toContain('当前模式：传统模式，下一步会生成传统分镜内容。')
    expect(html).toContain('当前将进入传统分镜生成')
    expect(html).toContain('继续执行剧本到分镜的传统生成链路')
    expect(html).toContain('确认并开始绘制 →')
  })
})
