import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { persistVideoPromptRunAtomically } from '@/lib/remake-projects/prompt/service'
import { prisma } from '@/lib/prisma'
import { resetBillingState } from '../../helpers/db-reset'

const videoAnalysis = {
  coreEvent: 'A runner crosses the street and looks back.', actions: ['run', 'look back'], interactions: ['avoids traffic'], directions: ['left to right'],
  blocking: 'runner remains foreground', shotScale: 'medium-wide', camera: 'eye level', movement: 'tracking left', rhythm: 'urgent', environmentChange: 'rain begins', temporalProgression: 'cross, glance back, exit frame',
}

async function createPromptReadyProject() {
  const user = await prisma.user.create({ data: { name: 'Prompt video test user', email: `prompt-video-${randomUUID()}@example.com` } })
  const project = await prisma.project.create({ data: { userId: user.id, name: 'Prompt video test', type: 'remake' } })
  const remake = await prisma.remakeProject.create({ data: { projectId: project.id, creationRequestId: randomUUID() } })
  const source = await prisma.remakeSource.create({ data: { remakeProjectId: remake.id, sourceRevision: 1, status: 'analyzed' } })
  await prisma.remakeProject.update({ where: { id: remake.id }, data: { currentSourceId: source.id } })
  const shots = await Promise.all(['shot-01', 'shot-02'].map(async (stableKey, index) => {
    const shot = await prisma.remakeShot.create({ data: { remakeProjectId: remake.id, stableKey, sequence: index + 1, currentRevision: 1, reviewStatus: 'keep' } })
    const revision = await prisma.remakeShotRevision.create({ data: { shotId: shot.id, revision: 1, changeReason: 'test', sourceRevision: 1, payload: JSON.stringify({ status: 'keep' }), keyframeMediaRefs: JSON.stringify({ first: `${stableKey}/first.jpg`, middle: `${stableKey}/middle.jpg`, last: `${stableKey}/last.jpg` }) } })
    return { stableKey, id: shot.id, revisionId: revision.id }
  }))
  return { projectId: project.id, shots }
}

describe('remake whole-video Prompt atomic persistence', () => {
  beforeEach(async () => { await resetBillingState() })

  it('creates one run and one pending version per exact confirmed Shot set only after every result validates', async () => {
    const fixture = await createPromptReadyProject()
    const result = await persistVideoPromptRunAtomically({
      projectId: fixture.projectId,
      expectedStableShotIds: fixture.shots.map((shot) => shot.stableKey),
      results: fixture.shots.map((shot) => ({ stableShotId: shot.stableKey, analysis: videoAnalysis })),
      rawOutput: '{"shots":["complete"]}',
      provenance: { taskId: randomUUID(), schemaVersion: 'prompt.v1', modelVersion: 'codex', executorVersion: 'codex-cli.v1' },
    })
    expect(result.versions).toHaveLength(2)
    await expect(prisma.remakePromptRun.count()).resolves.toBe(1)
    await expect(prisma.remakePromptVersion.count()).resolves.toBe(2)
    await expect(prisma.remakePromptTrack.findMany({ select: { adoptedVersionId: true } })).resolves.toEqual([{ adoptedVersionId: null }, { adoptedVersionId: null }])
  })

  it.each([
    ['partial', (keys: string[]) => [{ stableShotId: keys[0], analysis: videoAnalysis }]],
    ['duplicate', (keys: string[]) => [{ stableShotId: keys[0], analysis: videoAnalysis }, { stableShotId: keys[0], analysis: videoAnalysis }]],
    ['unknown', (keys: string[]) => [{ stableShotId: keys[0], analysis: videoAnalysis }, { stableShotId: 'unknown-shot', analysis: videoAnalysis }]],
    ['malformed', (keys: string[]) => keys.map((stableShotId) => ({ stableShotId, analysis: { ...videoAnalysis, coreEvent: '' } }))],
  ])('leaves no partial run or versions for %s results', async (_name, buildResults) => {
    const fixture = await createPromptReadyProject()
    await expect(persistVideoPromptRunAtomically({ projectId: fixture.projectId, expectedStableShotIds: fixture.shots.map((shot) => shot.stableKey), results: buildResults(fixture.shots.map((shot) => shot.stableKey)) })).rejects.toThrow()
    await expect(prisma.remakePromptRun.count()).resolves.toBe(0)
    await expect(prisma.remakePromptVersion.count()).resolves.toBe(0)
    await expect(prisma.remakePromptTrack.count()).resolves.toBe(0)
  })
})
