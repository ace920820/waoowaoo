import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildRemakeKeyframeTaskDescriptor,
  parseRemakeKeyframeTaskPayload,
} from '@/lib/remake-projects/keyframes/task-contract'

const ids = {
  projectId: '11111111-1111-4111-8111-111111111111',
  remakeProjectId: '22222222-2222-4222-8222-222222222222',
  shotId: '33333333-3333-4333-8333-333333333333',
  shotRevisionId: '44444444-4444-4444-8444-444444444444',
  promptVersionId: '55555555-5555-4555-8555-555555555555',
}

const frozenInput = {
  ...ids,
  stableKey: 'scene-001-shot-002',
  sourceRevision: 2,
  shotRevision: 4,
  slot: 'start' as const,
  promptText: 'Wide establishing frame of a rainy street.',
  model: { id: 'image-model-v1', provider: 'openai' },
  options: { aspectRatio: '16:9', quality: 'high' },
  referenceMediaIds: ['66666666-6666-4666-8666-666666666666'],
  requestedCandidateCount: 2,
}

describe('remake keyframe task contract', () => {
  it('freezes the selected slot, approved prompt, resolved model inputs, and operation identity', () => {
    const descriptor = buildRemakeKeyframeTaskDescriptor({
      projectId: ids.projectId,
      operationKey: 'generate-start-v1',
      inputSnapshot: frozenInput,
    })

    expect(descriptor.taskType).toBe('remake_keyframe_image_generate')
    expect(descriptor.targetType).toBe('remake_shot')
    expect(descriptor.targetId).toBe(ids.shotId)
    expect(descriptor.payload).toMatchObject({
      kind: 'keyframe',
      operationKey: 'generate-start-v1',
      inputSnapshot: frozenInput,
      inputFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(descriptor.dedupeKey).toContain('generate-start-v1')
    expect(parseRemakeKeyframeTaskPayload({ ...descriptor.payload, flowId: 'runtime-only' })).toEqual(descriptor.payload)
  })

  it('rejects payload tampering and cross-project frozen inputs', () => {
    const descriptor = buildRemakeKeyframeTaskDescriptor({
      projectId: ids.projectId,
      operationKey: 'generate-start-v1',
      inputSnapshot: frozenInput,
    })

    expect(() => buildRemakeKeyframeTaskDescriptor({
      projectId: '77777777-7777-4777-8777-777777777777',
      operationKey: 'generate-start-v1',
      inputSnapshot: frozenInput,
    })).toThrow('REMAKE_KEYFRAME_PROJECT_MISMATCH')
    expect(() => parseRemakeKeyframeTaskPayload({
      ...descriptor.payload,
      inputSnapshot: { ...frozenInput, requestedCandidateCount: 3 },
    })).toThrow('REMAKE_KEYFRAME_FINGERPRINT_INVALID')
  })
})

describe('remake keyframe persistence contract', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8')
  const migration = readFileSync('prisma/migrations/20260810120000_add_remake_keyframe_generation/migration.sql', 'utf8')

  it('keeps a revision-scoped slot track, immutable batches/candidates, and append-only adoption events', () => {
    expect(schema).toContain('model RemakeKeyframeTrack')
    expect(schema).toContain('@@unique([shotRevisionId, slot])')
    expect(schema).toContain('selectedForGeneration Boolean')
    expect(schema).toContain('adoptedCandidateId')
    expect(schema).toContain('model RemakeKeyframeBatch')
    expect(schema).toContain('model RemakeKeyframeCandidate')
    expect(schema).toContain('model RemakeKeyframeAdoptionEvent')
    expect(schema).toContain('outputVersionId String @unique')
    expect(migration).toContain('remake_keyframe_tracks')
    expect(migration).toContain('remake_keyframe_adoption_events')
  })

  it('extends the existing Remake evidence graph without writing Novel Promotion entities', () => {
    expect(schema).toContain('outputVersionId String?')
    expect(schema).toContain('@@unique([revisionId, kind, fingerprint])')
    expect(migration).toContain('remake_output_versions')
    expect(migration).not.toMatch(/NovelPromotion(?:Episode|Storyboard|Panel)|novel_promotion/i)
  })
})
