import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const routePath = 'src/app/api/remake-projects/[projectId]/units/preview/route.ts'
const panelPath = 'src/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoUnitPanel.tsx'

describe('unit action-sheet live preview contract (Phase 09.3)', () => {
  it('preview route renders a draft grid parameter with labels and columns, never persisting', () => {
    const source = readFileSync(routePath, 'utf8')
    expect(source).toContain('gridParam')
    expect(source).toContain('renderGrid')
    expect(source).toContain('gridQuerySchema')
    expect(source).toContain("label: `镜头${cell.shotNumber}·${slotLabel(cell.slot)}`")
    expect(source).toContain('renderUnitActionSheet(sources, { columns: grid.columns })')
    // saved layout is preferred over the legacy per-member path
    expect(source).toContain('savedGrid')
    // never persists: the persist helper is only ever mentioned, never invoked
    expect(source).not.toContain('renderAndPersistUnitActionSheet(')
    expect(source).not.toContain('RemakeVideoUnitActionSheet.create')
  })

  it('panel builds a debounced preview URL from the draft grid with unitId + grid params', () => {
    const source = readFileSync(panelPath, 'utf8')
    expect(source).toContain('previewUrl')
    expect(source).toContain('/units/preview?unitId=')
    expect(source).toContain('&grid=')
    expect(source).toContain('setTimeout')
    expect(source).toContain('400')
    expect(source).toContain('gridDraft.cells.length < 2')
    expect(source).toContain('previewUrl={previewUrl}')
  })
})
