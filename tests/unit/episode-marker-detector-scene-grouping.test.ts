import { describe, expect, it } from 'vitest'
import { detectEpisodeMarkers } from '@/lib/episode-marker-detector'

function buildSceneBlock(sceneHeading: string, bodyLabel: string): string {
  return [
    sceneHeading,
    `${bodyLabel}：这一段正文用于模拟真实剧本内容，包含人物动作、冲突推进、环境细节和情绪变化，确保长度足够触发检测逻辑。`,
    `补充段落：${bodyLabel}继续延展剧情，让当前场景看起来像完整脚本片段，而不是过短的测试样例。`,
  ].join('\n')
}

describe('episode-marker-detector scene grouping', () => {
  it.each([
    ['场景1', [1, 2, 3, 4]],
    ['场景01', [1, 2, 3, 4]],
    ['场景 01', [1, 2, 3, 4]],
    ['场景 12', [12, 13, 14, 15]],
  ])('detects supported scene heading format %s', (scenePrefix, sceneNumbers) => {
    const content = sceneNumbers
      .map((sceneNumber) => buildSceneBlock(
        scenePrefix.replace(/\d+$/, String(sceneNumber).padStart(scenePrefix.includes('01') || scenePrefix.includes(' 01') ? 2 : 0, '0')),
        `场景${sceneNumber}`,
      ))
      .join('\n\n')

    const result = detectEpisodeMarkers(content, { episodeSplitPreference: 'scene_group_2' })

    expect(result.hasMarkers).toBe(true)
    expect(result.markerTypeKey).toBe('sceneNumberGrouping')
    expect(result.previewSplits).toHaveLength(2)
    expect(result.matches.map(match => match.episodeNumber)).toEqual(sceneNumbers)
  })

  it('groups every 3 scene headings into one episode', () => {
    const content = [
      buildSceneBlock('场景01', '场景1'),
      buildSceneBlock('场景02', '场景2'),
      buildSceneBlock('场景03', '场景3'),
      buildSceneBlock('场景04', '场景4'),
      buildSceneBlock('场景05', '场景5'),
      buildSceneBlock('场景06', '场景6'),
    ].join('\n\n')

    const result = detectEpisodeMarkers(content, { episodeSplitPreference: 'scene_group_3' })

    expect(result.hasMarkers).toBe(true)
    expect(result.markerTypeKey).toBe('sceneNumberGrouping')
    expect(result.previewSplits).toHaveLength(2)
    expect(result.previewSplits.map(split => split.number)).toEqual([1, 2])
  })

  it('allows scene numbering to start from a non-01 scene when numbering stays consecutive', () => {
    const content = [
      buildSceneBlock('场景 12', '场景12'),
      buildSceneBlock('场景 13', '场景13'),
      buildSceneBlock('场景 14', '场景14'),
      buildSceneBlock('场景 15', '场景15'),
    ].join('\n\n')

    const result = detectEpisodeMarkers(content, { episodeSplitPreference: 'scene_group_2' })

    expect(result.hasMarkers).toBe(true)
    expect(result.matches.map(match => match.episodeNumber)).toEqual([12, 13, 14, 15])
    expect(result.previewSplits.map(split => split.number)).toEqual([1, 2])
  })

  it('falls back when scene numbering contains gaps', () => {
    const content = [
      buildSceneBlock('场景1', '场景1'),
      buildSceneBlock('场景3', '场景3'),
      buildSceneBlock('场景4', '场景4'),
      buildSceneBlock('场景6', '场景6'),
    ].join('\n\n')

    const result = detectEpisodeMarkers(content, { episodeSplitPreference: 'scene_group_2' })

    expect(result.hasMarkers).toBe(false)
    expect(result.markerTypeKey).toBe('')
    expect(result.previewSplits).toHaveLength(0)
  })

  it('falls back when scene numbering is duplicated', () => {
    const content = [
      buildSceneBlock('场景01', '场景1'),
      buildSceneBlock('场景02', '场景2'),
      buildSceneBlock('场景02', '场景2-重复'),
      buildSceneBlock('场景03', '场景3'),
    ].join('\n\n')

    const result = detectEpisodeMarkers(content, { episodeSplitPreference: 'scene_group_2' })

    expect(result.hasMarkers).toBe(false)
  })

  it('keeps explicit markers ahead of scene grouping', () => {
    const content = [
      '第1集 初始冲突',
      '这一集的内容足够长，包含人物关系、背景介绍和冲突升级，确保明确分集标记能被优先识别。',
      buildSceneBlock('场景01', '场景1'),
      buildSceneBlock('场景02', '场景2'),
      buildSceneBlock('场景03', '场景3'),
      '第2集 第二轮博弈',
      '第二集继续推进故事，补足长度并制造新的目标与阻碍，使显式分集标记更加明显。',
      buildSceneBlock('场景04', '场景4'),
      buildSceneBlock('场景05', '场景5'),
      buildSceneBlock('场景06', '场景6'),
    ].join('\n\n')

    const result = detectEpisodeMarkers(content, { episodeSplitPreference: 'scene_group_3' })

    expect(result.hasMarkers).toBe(true)
    expect(result.markerTypeKey).toBe('episode')
    expect(result.markerType).toBe('第X集')
  })
})
