import { describe, expect, it } from 'vitest'
import {
  buildRemakePromptTaskDescriptor,
  parseRemakePromptTaskPayload,
} from '@/lib/remake-projects/prompt/task-contract'
import type { PromptInputSnapshot } from '@/lib/remake-projects/prompt/contracts'

const UUID = '11111111-1111-4111-8111-111111111111'

function imageSnapshot(overrides: Partial<PromptInputSnapshot> = {}): PromptInputSnapshot {
  return {
    projectId: UUID,
    remakeProjectId: UUID,
    shotId: UUID,
    stableKey: 'shot-a',
    sourceRevision: 1,
    shotRevision: 1,
    shotRevisionId: UUID,
    keyframeMediaRefs: { first: 'media-first', middle: 'media-middle', last: 'media-last' },
    ...overrides,
  }
}

describe('remake prompt analyze task descriptor contract', () => {
  it('builds a strict image descriptor whose payload round-trips through the parser', () => {
    const snapshot = imageSnapshot()
    const descriptor = buildRemakePromptTaskDescriptor({
      kind: 'image',
      projectId: UUID,
      operationKey: 'op-image-1',
      slot: 'start',
      inputSnapshot: snapshot,
    })

    expect(descriptor.taskType).toBe('remake_image_prompt_analyze')
    expect(descriptor.targetType).toBe('remake_shot')
    expect(descriptor.targetId).toBe(snapshot.shotId)
    expect(descriptor.dedupeKey).toMatch(/^remake-prompt:image:/)
    expect(descriptor.inputFingerprint).toMatch(/^[a-f0-9]{64}$/)

    const parsed = parseRemakePromptTaskPayload(descriptor.payload)
    if (parsed.kind !== 'image') throw new Error('expected an image payload')
    expect(parsed.kind).toBe('image')
    expect(parsed.operationKey).toBe('op-image-1')
    expect(parsed.inputSnapshot.shotId).toBe(snapshot.shotId)
    // The task payload carries strict input facts only, never an execution boundary.
    expect(JSON.stringify(parsed)).not.toMatch(/child_process|spawn|execFile|shell\s*:/)
  })

  it('builds a strict whole-video descriptor covering every confirmed shot', () => {
    const snapshots = [imageSnapshot({ stableKey: 'shot-a' }), imageSnapshot({ stableKey: 'shot-b' })]
    const descriptor = buildRemakePromptTaskDescriptor({
      kind: 'video',
      projectId: UUID,
      operationKey: 'op-video-1',
      sourceRevision: 1,
      snapshots,
    })

    expect(descriptor.taskType).toBe('remake_video_prompt_analyze')
    expect(descriptor.targetType).toBe('remake_project')
    expect(descriptor.targetId).toBe(UUID)
    expect(descriptor.inputFingerprint).toMatch(/^[a-f0-9]{64}$/)

    const parsed = parseRemakePromptTaskPayload(descriptor.payload)
    if (parsed.kind !== 'video') throw new Error('expected a video payload')
    expect(parsed.kind).toBe('video')
    expect(parsed.snapshots.map((item) => item.stableKey)).toEqual(['shot-a', 'shot-b'])
    expect(JSON.stringify(parsed)).not.toMatch(/child_process|spawn|execFile|shell\s*:/)
  })
})
