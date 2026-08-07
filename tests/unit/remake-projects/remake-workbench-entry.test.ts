import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const workspacePath = 'src/app/[locale]/workspace/page.tsx'
const projectPath = 'src/app/[locale]/workspace/[projectId]/page.tsx'

describe('remake workbench entry', () => {
  it('offers video remake during project creation and opens the created project directly', () => {
    const source = readFileSync(workspacePath, 'utf8')

    expect(source).toContain("type: 'novel_promotion' as 'novel_promotion' | 'remake'")
    expect(source).toContain("{ value: 'remake', label: t('projectTypeRemake') }")
    expect(source).toContain("if (formData.type === 'remake' && createdProjectId)")
    expect(source).toContain('router.push({ pathname: `/workspace/${createdProjectId}` })')
  })

  it('mounts the real remake workbench for remake projects instead of the legacy placeholder', () => {
    const source = readFileSync(projectPath, 'utf8')

    expect(source).toContain("import RemakeWorkbench from './modes/remake/RemakeWorkbench'")
    expect(source).toContain('<RemakeWorkbench projectId={projectId} onStageChange={updateUrlStage} />')
    expect(source).not.toContain("{t('remakeWorkbench.notImported')}")
  })

  it('keeps remake projects out of novel-promotion episode initialization', () => {
    const source = readFileSync(projectPath, 'utf8')

    expect(source).toContain("const isRemakeProject = project?.type === 'remake'")
    expect(source).toContain("const shouldAutoCreateEpisode = !isRemakeProject && isZeroState && importStatus !== 'pending'")
    expect(source).toContain("!isRemakeProject && project && !project.novelPromotionData")
  })
})
