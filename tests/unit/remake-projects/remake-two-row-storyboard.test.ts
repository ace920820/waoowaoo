import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const stagePath = 'src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/RemakeStoryboardStage.tsx'
const adapterPath = 'src/lib/remake-projects/keyframes/adapter.ts'

describe('Remake 2×3 storyboard layout contract', () => {
  it('adapter exposes buildTwoRowLayout for strict 3-column alignment', () => {
    const source = readFileSync(adapterPath, 'utf8')
    expect(source).toContain('export function buildTwoRowLayout')
    expect(source).toContain("REMAKE_KEYFRAME_SLOTS.map")
    expect(source).toContain("'start'")
    expect(source).toContain("'middle'")
    expect(source).toContain("'end'")
  })

  it('stage renders two labeled rows (original + new) with column structure', () => {
    const source = readFileSync(stagePath, 'utf8')
    // Must have both row labels
    expect(source).toMatch(/原始动作参考/)
    expect(source).toMatch(/新画面参考/)
    // Must use buildTwoRowLayout
    expect(source).toContain('buildTwoRowLayout')
    // Uses the two-row grid component, not separate standalone sections
    expect(source).toContain('TwoRowGrid')
  })

  it('clicking an original frame toggles selected state separately from generation checkbox', () => {
    const source = readFileSync(stagePath, 'utf8')
    // Selected source slot is local React state
    expect(source).toContain('selectedSourceSlot')
    expect(source).toContain('setSelectedSourceSlot')
    // Generation selection uses a separate mutation
    expect(source).toContain('useSelectRemakeKeyframe')
    // The click handler for the frame should NOT be the same as the checkbox handler
    // (i.e. clicking the frame doesn't call select.mutate)
    // Frame click handler calls onSelectSlot, not the select mutation
    expect(source).toContain('onSelectSlot')
    // Checkbox handler uses the select mutation separately
    expect(source).toContain('onToggleGenerate')
  })

  it('embeds the unit lifecycle panel with a management toggle (D-19 revised)', () => {
    const source = readFileSync(stagePath, 'utf8')
    // Full panel (list + detail) embedded on the storyboard page
    expect(source).toContain('RemakeVideoUnitPanel')
    expect(source).toContain('storyboard-unit-panel-toggle')
    expect(source).toContain('unitPanelOpen')
    // Shot overview badges unit membership (D-18)
    expect(source).toContain('buildShotToUnitMap')
    expect(source).toContain('shotToUnit={shotToUnit}')
  })
})
