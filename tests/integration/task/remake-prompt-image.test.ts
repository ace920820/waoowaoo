import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { persistImagePromptVersion } from '@/lib/remake-projects/prompt/service'
import { prisma } from '@/lib/prisma'
import { resetBillingState } from '../../helpers/db-reset'

const imageAnalysis = {
  analysisBasis: { visibleFacts: ['one subject'], photographicInferences: ['eye level'], generationRecommendations: ['retain framing'] },
  structuredPrompt: { cameraAndComposition: { framing: 'medium' }, depthAndImaging: { depthOfField: 'medium' }, subjects: [{ action: 'walk' }], sceneAndSpace: { setting: 'street' }, lighting: { key: 'soft' }, colorAndStyle: { palette: 'blue' } },
  integratedGenerationPrompt: 'A person walks down a blue street.',
  negativeConstraints: ['no extra people'],
  pendingQuestions: ['exact lens unknown'],
}

async function createPromptReadyShot() {
  const user = await prisma.user.create({ data: { name: 'Prompt image test user', email: `prompt-image-${randomUUID()}@example.com` } })
  const project = await prisma.project.create({ data: { userId: user.id, name: 'Prompt image test', type: 'remake' } })
  const remake = await prisma.remakeProject.create({ data: { projectId: project.id, creationRequestId: randomUUID() } })
  const source = await prisma.remakeSource.create({ data: { remakeProjectId: remake.id, sourceRevision: 1, status: 'analyzed' } })
  await prisma.remakeProject.update({ where: { id: remake.id }, data: { currentSourceId: source.id } })
  const shot = await prisma.remakeShot.create({ data: { remakeProjectId: remake.id, stableKey: 'shot-01', currentRevision: 1, reviewStatus: 'keep' } })
  const revision = await prisma.remakeShotRevision.create({ data: { shotId: shot.id, revision: 1, changeReason: 'test', sourceRevision: 1, payload: JSON.stringify({ status: 'keep' }), keyframeMediaRefs: JSON.stringify({ first: 'frames/start.jpg', middle: 'frames/middle.jpg', last: 'frames/end.jpg' }) } })
  return {
    projectId: project.id,
    shotId: shot.id,
    snapshot: { projectId: project.id, remakeProjectId: remake.id, shotId: shot.id, stableKey: shot.stableKey, sourceRevision: 1, shotRevision: 1, shotRevisionId: revision.id, keyframeMediaRefs: { first: 'frames/start.jpg', middle: 'frames/middle.jpg', last: 'frames/end.jpg' } },
  }
}

describe('remake image prompt persistence', () => {
  beforeEach(async () => { await resetBillingState() })

  it('stores the full structured result, section 3/4 display fields, raw output, and provenance for one frame slot', async () => {
    const fixture = await createPromptReadyShot()
    const version = await persistImagePromptVersion({
      projectId: fixture.projectId,
      shotId: fixture.shotId,
      targetKey: 'image:start',
      inputSnapshot: fixture.snapshot,
      analysis: imageAnalysis,
      rawOutput: '{"complete":"raw result"}',
      provenance: { taskId: randomUUID(), skillVersion: 'image-to-structured-prompt', schemaVersion: 'prompt.v1', modelVersion: 'codex', executorVersion: 'codex-cli.v1' },
    })

    expect(version).toMatchObject({ integratedGenerationPrompt: imageAnalysis.integratedGenerationPrompt, negativeConstraints: imageAnalysis.negativeConstraints, rawOutput: '{"complete":"raw result"}', skillVersion: 'image-to-structured-prompt' })
    expect(version.parsedSections).toMatchObject({ structuredPrompt: imageAnalysis.structuredPrompt, pendingQuestions: imageAnalysis.pendingQuestions })
  })

  it('rejects malformed partial parsing without adding a Prompt version', async () => {
    const fixture = await createPromptReadyShot()
    await expect(persistImagePromptVersion({
      projectId: fixture.projectId,
      shotId: fixture.shotId,
      targetKey: 'image:middle',
      inputSnapshot: fixture.snapshot,
      analysis: { ...imageAnalysis, pendingQuestions: undefined },
      rawOutput: 'unparsed source is retained by the worker error path',
    })).rejects.toThrow()
    await expect(prisma.remakePromptVersion.count()).resolves.toBe(0)
  })
})
