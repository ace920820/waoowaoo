import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '@/lib/prisma'

const db = prisma
const CURRENT_MIGRATION = '20260810120000_add_remake_keyframe_generation'
const BASELINE_COMMIT = process.env.REMAKE_KEYFRAME_BASELINE_COMMIT || 'e933e2a'
const ids = {
  userId: randomUUID(),
  projectId: randomUUID(),
  remakeProjectId: randomUUID(),
  shotId: randomUUID(),
  revisionId: randomUUID(),
  promptTrackId: randomUUID(),
  promptVersionId: randomUUID(),
}

function shell(command: string, args: string[], options: { input?: Buffer | string; stdio?: 'ignore' | 'pipe' } = {}) {
  return execFileSync(command, args, { cwd: process.cwd(), env: process.env, encoding: options.input ? undefined : 'utf8', ...options })
}

function ensureKeyframeMigrationFixture() {
  shell('docker', ['compose', '-f', 'docker-compose.test.yml', 'up', '-d', 'mysql'], { stdio: 'ignore' })
  const tableCount = String(shell('docker', ['exec', 'waoowaoo-test-mysql', 'mysql', '-uroot', '-proot', 'waoowaoo_test', '-Nse', "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'waoowaoo_test' AND table_name = 'remake_shots'"])).trim()
  if (tableCount !== '0') return

  // The repository predates a baseline migration. Build that baseline only inside
  // the isolated test database, then mark its historical migrations applied.
  const tempDir = mkdtempSync(join(tmpdir(), 'waoowaoo-keyframe-schema-'))
  const schemaPath = join(tempDir, 'schema.prisma')
  try {
    const baselineSchema = String(shell('git', ['show', `${BASELINE_COMMIT}:prisma/schema.prisma`]))
    writeFileSync(schemaPath, baselineSchema)
    const baselineSql = shell('npx', ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', schemaPath, '--script'])
    shell('docker', ['exec', '-i', 'waoowaoo-test-mysql', 'mysql', '-uroot', '-proot', 'waoowaoo_test'], { input: baselineSql })
    const migrationNames = readdirSync('prisma/migrations').filter((name) => name !== CURRENT_MIGRATION).sort()
    for (const migrationName of migrationNames) {
      shell('npx', ['prisma', 'migrate', 'resolve', '--applied', migrationName], { stdio: 'ignore' })
    }
    shell('npx', ['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { stdio: 'ignore' })
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

beforeAll(async () => {
  ensureKeyframeMigrationFixture()
  await db.user.create({ data: { id: ids.userId, name: `keyframe-test-${ids.userId}`, email: `keyframe-${ids.userId}@example.test` } })
  await db.project.create({ data: { id: ids.projectId, userId: ids.userId, name: 'Keyframe test', type: 'remake' } })
  await db.remakeProject.create({ data: { id: ids.remakeProjectId, projectId: ids.projectId, creationRequestId: randomUUID() } })
  await db.remakeShot.create({ data: { id: ids.shotId, remakeProjectId: ids.remakeProjectId, stableKey: 'scene-001-shot-001', currentRevision: 1 } })
  await db.remakeShotRevision.create({ data: { id: ids.revisionId, shotId: ids.shotId, revision: 1, changeReason: 'test', sourceRevision: 1 } })
  await db.remakePromptTrack.create({ data: { id: ids.promptTrackId, remakeProjectId: ids.remakeProjectId, shotId: ids.shotId, targetKey: 'image:start' } })
  await db.remakePromptVersion.create({
    data: {
      id: ids.promptVersionId,
      trackId: ids.promptTrackId,
      shotRevisionId: ids.revisionId,
      versionNumber: 1,
      status: 'approved',
      inputFingerprint: 'a'.repeat(64),
      inputSnapshot: { sourceRevision: 1 },
      integratedGenerationPrompt: 'Rainy city street at dusk.',
    },
  })
})

afterAll(async () => {
  await db.project.deleteMany({ where: { id: ids.projectId } })
  await db.user.deleteMany({ where: { id: ids.userId } })
  await prisma.$disconnect()
})

describe('remake keyframe persistence', () => {
  it('round-trips one selected Start track with immutable batch/candidate history and revision action-sheet evidence', async () => {
    const track = await db.remakeKeyframeTrack.create({ data: { shotRevisionId: ids.revisionId, slot: 'start' } })
    expect(track.selectedForGeneration).toBe(false)
    await expect(db.remakeKeyframeTrack.create({ data: { shotRevisionId: ids.revisionId, slot: 'start' } })).rejects.toMatchObject({ code: 'P2002' })
    const selected = await db.remakeKeyframeTrack.update({ where: { id: track.id }, data: { selectedForGeneration: true } })
    expect((await db.remakeKeyframeTrack.findUnique({ where: { id: selected.id } }))?.selectedForGeneration).toBe(true)

    const batch = await db.remakeKeyframeBatch.create({
      data: {
        trackId: track.id,
        promptVersionId: ids.promptVersionId,
        taskId: randomUUID(),
        operationKey: 'start-v1',
        inputFingerprint: 'b'.repeat(64),
        inputSnapshot: { slot: 'start', promptVersionId: ids.promptVersionId, promptText: 'Rainy city street at dusk.' },
        modelId: 'image-model-v1',
        modelOptions: { aspectRatio: '16:9' },
        referenceMediaIds: [],
        requestedCandidateCount: 2,
      },
    })
    await expect(db.remakeKeyframeBatch.create({ data: { trackId: batch.trackId, promptVersionId: batch.promptVersionId, taskId: batch.taskId, operationKey: batch.operationKey, inputFingerprint: batch.inputFingerprint, inputSnapshot: { slot: 'start', promptVersionId: ids.promptVersionId, promptText: 'Rainy city street at dusk.' }, modelId: batch.modelId, modelOptions: { aspectRatio: '16:9' }, referenceMediaIds: [], requestedCandidateCount: batch.requestedCandidateCount } })).rejects.toMatchObject({ code: 'P2002' })
    const firstOutput = await db.remakeOutputVersion.create({ data: { shotId: ids.shotId, revisionId: ids.revisionId, kind: 'keyframe_candidate', fingerprint: 'candidate-1', taskId: batch.taskId, status: 'completed' } })
    const secondOutput = await db.remakeOutputVersion.create({ data: { shotId: ids.shotId, revisionId: ids.revisionId, kind: 'keyframe_candidate', fingerprint: 'candidate-2', taskId: batch.taskId, status: 'completed' } })
    const first = await db.remakeKeyframeCandidate.create({ data: { batchId: batch.id, outputVersionId: firstOutput.id, ordinal: 1 } })
    const second = await db.remakeKeyframeCandidate.create({ data: { batchId: batch.id, outputVersionId: secondOutput.id, ordinal: 2 } })
    expect((await db.remakeKeyframeCandidate.findMany({ where: { batchId: batch.id }, orderBy: { ordinal: 'asc' } })).map((candidate: { id: string }) => candidate.id)).toEqual([first.id, second.id])

    await db.remakeKeyframeTrack.update({ where: { id: track.id }, data: { adoptedCandidateId: first.id } })
    await db.remakeKeyframeAdoptionEvent.create({ data: { trackId: track.id, previousCandidateId: null, nextCandidateId: first.id } })
    await db.remakeKeyframeTrack.update({ where: { id: track.id }, data: { adoptedCandidateId: second.id } })
    await db.remakeKeyframeAdoptionEvent.create({ data: { trackId: track.id, previousCandidateId: first.id, nextCandidateId: second.id } })
    expect((await db.remakeKeyframeTrack.findUnique({ where: { id: track.id } }))?.adoptedCandidateId).toBe(second.id)
    expect(await db.remakeKeyframeAdoptionEvent.count({ where: { trackId: track.id } })).toBe(2)

    const actionSheet = await db.remakeOutputVersion.create({ data: { shotId: ids.shotId, revisionId: ids.revisionId, kind: 'action_sheet', fingerprint: 'action-sheet-v1', status: 'completed' } })
    await db.remakeProvenanceRecord.create({ data: { shotId: ids.shotId, outputVersionId: actionSheet.id, schema: 'remake-keyframe-action-sheet@1', payload: JSON.stringify({ renderer: 'action-sheet@1', sources: [{ slot: 'start', mediaId: 'start', timestamp: 0 }, { slot: 'middle', mediaId: 'middle', timestamp: 10 }, { slot: 'end', mediaId: 'end', timestamp: 20 }] }) } })
    await db.remakeInvalidation.create({ data: { shotId: ids.shotId, revisionId: ids.revisionId, outputVersionId: actionSheet.id, reason: 'test', status: 'needs_review' } })
    const provenance = await db.remakeProvenanceRecord.findFirst({ where: { outputVersionId: actionSheet.id } })
    expect(JSON.parse(provenance?.payload ?? '{}').sources.map((source: { slot: string }) => source.slot)).toEqual(['start', 'middle', 'end'])
    await expect(db.remakeOutputVersion.create({ data: { shotId: ids.shotId, revisionId: ids.revisionId, kind: 'action_sheet', fingerprint: 'action-sheet-v1', status: 'completed' } })).rejects.toMatchObject({ code: 'P2002' })
  })
})
