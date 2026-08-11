import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { prisma } from '@/lib/prisma'

// The repository's NextAuth type surface does not expose jwt/encode to the
// application compiler, although the runtime module does. Keep this fixture
// test-only and avoid widening production auth types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { encode } = require('next-auth/jwt') as { encode: (input: { secret: string; token: Record<string, string>; maxAge: number }) => Promise<string> }

export type RemakeKeyframeFixture = {
  projectId: string
  userId: string
  sessionToken: string
  shotId: string
  startTrackId: string
  startCandidateId: string
  originalMediaIds: Record<'start' | 'middle' | 'end', string>
}

const secret = process.env.NEXTAUTH_SECRET || 'remake-keyframe-e2e-secret'

async function media(label: string) {
  const storageKey = `e2e/remake-keyframes/${label}-${randomUUID()}.png`
  await mkdir(join(process.cwd(), 'data', 'uploads', 'e2e', 'remake-keyframes'), { recursive: true })
  await writeFile(join(process.cwd(), 'data', 'uploads', storageKey), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
  return prisma.mediaObject.create({
    data: {
      publicId: `e2e-${label}-${randomUUID()}`,
      storageKey,
      mimeType: 'image/png',
      sizeBytes: BigInt(1),
      width: 1280,
      height: 720,
    },
  })
}

/** Seeds a complete, caller-owned Remake graph without using production identities. */
export async function seedRemakeKeyframeProject(): Promise<RemakeKeyframeFixture> {
  const userId = randomUUID()
  const projectId = randomUUID()
  const remakeProjectId = randomUUID()
  const shotId = randomUUID()
  const revisionId = randomUUID()
  const start = await media('original-start')
  const middle = await media('original-middle')
  const end = await media('original-end')
  const actionSheet = await media('action-sheet')
  const candidateOne = await media('candidate-one')
  const candidateTwo = await media('candidate-two')

  await prisma.user.create({ data: { id: userId, name: `remake-e2e-${userId}`, email: `remake-e2e-${userId}@example.test` } })
  await prisma.project.create({ data: { id: projectId, userId, name: 'Remake keyframe E2E project with deliberately long state text', description: 'A deterministic, authenticated real-route fixture for keyframe acceptance.', type: 'remake' } })
  await prisma.remakeProject.create({ data: { id: remakeProjectId, projectId, creationRequestId: randomUUID() } })
  const source = await prisma.remakeSource.create({ data: { remakeProjectId, sourceRevision: 1, status: 'analyzed', operationKey: randomUUID(), probeMetadata: JSON.stringify({ fileName: 'fixture.mp4', width: 1920, height: 1080, fps: 24 }) } })
  await prisma.remakeProject.update({ where: { id: remakeProjectId }, data: { currentSourceId: source.id } })
  await prisma.remakeShot.create({ data: { id: shotId, remakeProjectId, stableKey: 'fixture-shot-001', sequence: 1, reviewStatus: 'approved', currentRevision: 1 } })
  await prisma.remakeShotRevision.create({ data: { id: revisionId, shotId, revision: 1, changeReason: 'fixture confirmation', lifecycleState: 'active', sourceRevision: 1, payload: JSON.stringify({ status: 'keep', startTimecode: '00:00:00:00', endTimecode: '00:00:03:12' }), keyframeMediaRefs: JSON.stringify({ first: start.id, middle: middle.id, last: end.id }) } })

  const promptVersions: Record<string, string> = {}
  const inputSnapshot = {
    projectId,
    remakeProjectId,
    shotId,
    stableKey: 'fixture-shot-001',
    sourceRevision: 1,
    shotRevision: 1,
    shotRevisionId: revisionId,
    keyframeMediaRefs: { first: start.id, middle: middle.id, last: end.id },
  }
  for (const slot of ['start', 'middle', 'end', 'video'] as const) {
    const track = await prisma.remakePromptTrack.create({ data: { remakeProjectId, shotId, targetKey: slot === 'video' ? 'video' : `image:${slot}` } })
    const approved = slot !== 'middle'
    const version = await prisma.remakePromptVersion.create({ data: { trackId: track.id, shotRevisionId: revisionId, versionNumber: 1, status: approved ? 'approved' : 'pending_review', inputFingerprint: randomUUID().replaceAll('-', ''), inputSnapshot, integratedGenerationPrompt: `Long deterministic ${slot} prompt. `.repeat(12) } })
    if (approved) await prisma.remakePromptTrack.update({ where: { id: track.id }, data: { adoptedVersionId: version.id } })
    promptVersions[slot] = version.id
  }

  const startTrack = await prisma.remakeKeyframeTrack.create({ data: { shotRevisionId: revisionId, slot: 'start', selectedForGeneration: false } })
  await prisma.remakeKeyframeTrack.create({ data: { shotRevisionId: revisionId, slot: 'middle', selectedForGeneration: false } })
  await prisma.remakeKeyframeTrack.create({ data: { shotRevisionId: revisionId, slot: 'end', selectedForGeneration: false } })
  const task = await prisma.task.create({ data: { userId, projectId, type: 'remake_keyframe_image_generate', targetType: 'remake_shot', targetId: shotId, status: 'completed', payload: { fixture: true, model: 'fixture::image', options: { size: '1280x720', quality: 'high' }, count: 2 } } })
  const batch = await prisma.remakeKeyframeBatch.create({ data: { trackId: startTrack.id, promptVersionId: promptVersions.start, taskId: task.id, operationKey: 'fixture-initial-batch', inputFingerprint: randomUUID().replaceAll('-', ''), inputSnapshot: { promptVersionId: promptVersions.start, model: 'fixture::image', options: { size: '1280x720', quality: 'high' }, referenceMediaIds: [], count: 2 }, modelId: 'fixture::image', modelOptions: { size: '1280x720', quality: 'high' }, referenceMediaIds: [], requestedCandidateCount: 2 } })
  const outputOne = await prisma.remakeOutputVersion.create({ data: { shotId, revisionId, mediaId: candidateOne.id, kind: 'keyframe_candidate', fingerprint: randomUUID(), taskId: task.id, inputSnapshot: { fixture: true }, status: 'completed' } })
  const outputTwo = await prisma.remakeOutputVersion.create({ data: { shotId, revisionId, mediaId: candidateTwo.id, kind: 'keyframe_candidate', fingerprint: randomUUID(), taskId: task.id, inputSnapshot: { fixture: true }, status: 'completed' } })
  const firstCandidate = await prisma.remakeKeyframeCandidate.create({ data: { batchId: batch.id, outputVersionId: outputOne.id, ordinal: 1 } })
  await prisma.remakeKeyframeCandidate.create({ data: { batchId: batch.id, outputVersionId: outputTwo.id, ordinal: 2 } })
  await prisma.remakeKeyframeTrack.update({ where: { id: startTrack.id }, data: { adoptedCandidateId: firstCandidate.id } })
  await prisma.remakeKeyframeAdoptionEvent.create({ data: { trackId: startTrack.id, nextCandidateId: firstCandidate.id, reviewerId: userId } })
  await prisma.remakeOutputVersion.create({ data: { shotId, revisionId, mediaId: actionSheet.id, kind: 'action_sheet', fingerprint: `fixture-sheet-${revisionId}`, status: 'completed' } })

  const sessionToken = await encode({ secret, token: { sub: userId, id: userId, name: `remake-e2e-${userId}`, email: `remake-e2e-${userId}@example.test` }, maxAge: 60 * 60 })
  return { projectId, userId, sessionToken, shotId, startTrackId: startTrack.id, startCandidateId: firstCandidate.id, originalMediaIds: { start: start.id, middle: middle.id, end: end.id } }
}

export async function removeRemakeKeyframeProject(fixture: Pick<RemakeKeyframeFixture, 'projectId' | 'userId'>) {
  await prisma.project.deleteMany({ where: { id: fixture.projectId } })
  await prisma.user.deleteMany({ where: { id: fixture.userId } })
}
