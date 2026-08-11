import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const panelPath = 'src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/ShotSemanticsPanel.tsx'

describe('Remake semantics panel asset picker integration', () => {
  it('imports GlobalAssetPicker for scene / character / prop selection', () => {
    const source = readFileSync(panelPath, 'utf8')
    expect(source).toContain('GlobalAssetPicker')
  })

  it('scene section uses GlobalAssetPicker location type with asset ID backing', () => {
    const source = readFileSync(panelPath, 'utf8')
    expect(source).toContain('SceneAssetSelector')
    // Uses location type for scene selection (check for the type prop with location)
    expect(source).toMatch(/type=\s*['"]location['"]/)
    expect(source).toContain('sceneAssetId')
  })

  it('character section uses chip multi-select with GlobalAssetPicker', () => {
    const source = readFileSync(panelPath, 'utf8')
    expect(source).toContain('CharacterChipSelector')
    expect(source).toMatch(/type=\s*['"]character['"]/)
    expect(source).toContain('characterAssetIds')
  })

  it('props section exists with chip multi-select', () => {
    const source = readFileSync(panelPath, 'utf8')
    expect(source).toContain('PropChipSelector')
    expect(source).toMatch(/type=\s*['"]prop['"]/)
    expect(source).toContain('propAssetIds')
  })

  it('scene shows effective source (default vs shot-specific)', () => {
    const source = readFileSync(panelPath, 'utf8')
    expect(source).toMatch(/跟随默认|默认场景|本镜头|单独指定|项目默认/)
  })

  it('asset updates go through semantics PATCH API', () => {
    const source = readFileSync(panelPath, 'utf8')
    expect(source).toContain('useUpdateRemakeShotSemantics')
  })

  it('missing assets still allow generation (non-blocking)', () => {
    const source = readFileSync(panelPath, 'utf8')
    expect(source).toMatch(/未绑定|缺失.*继续|可继续生成|不阻止|仍允许/)
  })
})
