import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildRemakeVideoTaskDescriptor,
  parseRemakeVideoTaskPayload,
} from '@/lib/remake-projects/video/task-contract'
import {
  assertVideoReferenceOrder,
  assertVideoReferencesHaveKeyframe,
  videoInputFingerprint,
} from '@/lib/remake-projects/video/contracts'
import { deriveDefaultVideoDuration } from '@/lib/remake-projects/video/service'
import { resolveEffectiveVideoCapabilityDefinitions } from '@/lib/model-capabilities/video-effective'

const ids = {
  projectId: '11111111-1111-4111-8111-111111111111',
  remakeProjectId: '22222222-2222-4222-8222-222222222222',
  shotId: '33333333-3333-4333-8333-333333333333',
  shotRevisionId: '44444444-4444-4444-8444-444444444444',
  promptVersionId: '55555555-5555-4555-8555-555555555555',
  startMediaId: '66666666-6666-4666-8666-666666666666',
  middleMediaId: '76666666-6666-4666-8666-666666666666',
  endMediaId: '86666666-6666-4666-8666-666666666666',
  actionSheetMediaId: '96666666-6666-4666-8666-666666666666',
}

const frozenInput = {
  projectId: ids.projectId,
  remakeProjectId: ids.remakeProjectId,
  shotId: ids.shotId,
  shotRevisionId: ids.shotRevisionId,
  promptVersionId: ids.promptVersionId,
  stableKey: 'scene-001-shot-002',
  sourceRevision: 2,
  shotRevision: 4,
  promptText: 'A character runs through a rainy alley.',
  model: { id: 'video-model-v1', provider: 'openai' },
  options: { resolution: '720p', generateAudio: false },
  orderedReferences: [
    { role: 'start_keyframe' as const, ordinal: 1, mediaId: ids.startMediaId },
    { role: 'middle_keyframe' as const, ordinal: 2, mediaId: ids.middleMediaId },
    { role: 'end_keyframe' as const, ordinal: 3, mediaId: ids.endMediaId },
    { role: 'action_sheet' as const, ordinal: 4, mediaId: ids.actionSheetMediaId },
  ],
  durationSeconds: 5,
}

describe('remake video task contract', () => {
  it('freezes ordered references, prompt, model inputs, and operation identity', () => {
    const descriptor = buildRemakeVideoTaskDescriptor({
      projectId: ids.projectId,
      operationKey: 'generate-shot-002-v1',
      inputSnapshot: frozenInput,
    })

    expect(descriptor.taskType).toBe('remake_video_generate')
    expect(descriptor.targetType).toBe('remake_shot')
    expect(descriptor.targetId).toBe(ids.shotId)
    expect(descriptor.payload).toMatchObject({
      kind: 'video',
      operationKey: 'generate-shot-002-v1',
      inputSnapshot: frozenInput,
      inputFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(descriptor.dedupeKey).toContain('generate-shot-002-v1')
    expect(parseRemakeVideoTaskPayload({ ...descriptor.payload, flowId: 'runtime-only' })).toEqual(descriptor.payload)
  })

  it('rejects payload tampering and cross-project frozen inputs', () => {
    const descriptor = buildRemakeVideoTaskDescriptor({
      projectId: ids.projectId,
      operationKey: 'generate-shot-002-v1',
      inputSnapshot: frozenInput,
    })

    expect(() => buildRemakeVideoTaskDescriptor({
      projectId: 'aaaa1111-1111-4111-8111-111111111111',
      operationKey: 'generate-shot-002-v1',
      inputSnapshot: frozenInput,
    })).toThrow('REMAKE_VIDEO_PROJECT_MISMATCH')

    expect(() => parseRemakeVideoTaskPayload({
      ...descriptor.payload,
      inputSnapshot: { ...frozenInput, durationSeconds: 10 },
    })).toThrow('REMAKE_VIDEO_FINGERPRINT_INVALID')
  })

  it('rejects submissions with only action sheet (no keyframe reference)', () => {
    const actionOnly = {
      ...frozenInput,
      orderedReferences: [
        { role: 'action_sheet' as const, ordinal: 1, mediaId: ids.actionSheetMediaId },
      ],
    }
    expect(() => buildRemakeVideoTaskDescriptor({
      projectId: ids.projectId,
      operationKey: 'bad-action-only',
      inputSnapshot: actionOnly,
    })).toThrow('REMAKE_VIDEO_NO_KEYFRAME_REFERENCE')
  })

  it('rejects out-of-order reference roles (D-04 fixed order)', () => {
    const reversed = {
      ...frozenInput,
      orderedReferences: [
        { role: 'end_keyframe' as const, ordinal: 1, mediaId: ids.endMediaId },
        { role: 'start_keyframe' as const, ordinal: 2, mediaId: ids.startMediaId },
      ],
    }
    expect(() => buildRemakeVideoTaskDescriptor({
      projectId: ids.projectId,
      operationKey: 'bad-order',
      inputSnapshot: reversed,
    })).toThrow('REMAKE_VIDEO_REFERENCE_ORDER_INVALID')
  })

  it('produces the same fingerprint for the same ordered snapshot', () => {
    const a = buildRemakeVideoTaskDescriptor({
      projectId: ids.projectId,
      operationKey: 'op1',
      inputSnapshot: frozenInput,
    })
    const b = buildRemakeVideoTaskDescriptor({
      projectId: ids.projectId,
      operationKey: 'op1',
      inputSnapshot: { ...frozenInput },
    })
    expect(a.inputFingerprint).toBe(b.inputFingerprint)
    expect(a.payload.inputFingerprint).toBe(videoInputFingerprint(frozenInput))
  })
})

describe('duration derivation (D-10 / D-11)', () => {
  const continuousDefs = resolveEffectiveVideoCapabilityDefinitions({
    videoCapabilities: { durationOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  })

  const discreteDefs = resolveEffectiveVideoCapabilityDefinitions({
    videoCapabilities: { durationOptions: [5, 10, 15] },
  })

  it('D-10: rounds up shot duration and caps at 15s for continuous models', () => {
    expect(deriveDefaultVideoDuration(2.3, continuousDefs)).toBe(3)
    expect(deriveDefaultVideoDuration(0.5, continuousDefs)).toBe(1)
    expect(deriveDefaultVideoDuration(20, continuousDefs)).toBe(15)
  })

  it('D-11: rounds up to nearest discrete option', () => {
    expect(deriveDefaultVideoDuration(2.3, discreteDefs)).toBe(5)
    expect(deriveDefaultVideoDuration(6.1, discreteDefs)).toBe(10)
    expect(deriveDefaultVideoDuration(12, discreteDefs)).toBe(15)
  })

  it('D-10: respects model minimum duration', () => {
    const minOnly = resolveEffectiveVideoCapabilityDefinitions({
      videoCapabilities: { durationOptions: [3, 4, 5, 6, 7, 8, 9, 10] },
    })
    expect(deriveDefaultVideoDuration(1, minOnly)).toBe(3)
  })

  it('D-10: caps at model max when model max is below 15', () => {
    const shortOnly = resolveEffectiveVideoCapabilityDefinitions({
      videoCapabilities: { durationOptions: [1, 2, 3, 4, 5] },
    })
    expect(deriveDefaultVideoDuration(10, shortOnly)).toBe(5)
  })
})

describe('remake video persistence contract', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8')
  const migration = readFileSync(
    'prisma/migrations/20260812090000_add_remake_video_generation/migration.sql',
    'utf8',
  )

  it('keeps a revision-scoped video track, immutable batches/versions, and append-only adoption events', () => {
    expect(schema).toContain('model RemakeVideoTrack')
    expect(schema).toContain('@@unique([shotRevisionId])')
    expect(schema).toContain('adoptedVersionId')
    expect(schema).toContain('model RemakeVideoBatch')
    expect(schema).toContain('model RemakeVideoVersion')
    expect(schema).toContain('model RemakeVideoAdoptionEvent')
    expect(schema).toMatch(/outputVersionId\s+String\s+@unique/)
    expect(migration).toContain('remake_video_tracks')
    expect(migration).toContain('remake_video_batches')
    expect(migration).toContain('remake_video_versions')
    expect(migration).toContain('remake_video_adoption_events')
  })

  it('orderedReferences is stored in the batch for exact-input traceability (D-06)', () => {
    expect(schema).toContain('orderedReferences')
    expect(migration).toContain('orderedReferences')
  })

  it('extends the existing Remake evidence graph without writing Novel Promotion entities', () => {
    expect(schema).toContain('outputVersionId String?')
    expect(migration).toContain('remake_output_versions')
    expect(migration).not.toMatch(/NovelPromotion|novel_promotion/i)
  })
})
