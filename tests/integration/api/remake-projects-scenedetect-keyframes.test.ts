import { describe, expect, it } from 'vitest'
import { keyframeTupleHash } from '@/lib/remake-projects/scenedetect/keyframes'
import { buildSceneDetectTaskDescriptor } from '@/lib/remake-projects/scenedetect/task-contract'

describe('SceneDetect keyframe contract', () => {
  it('binds extraction dedupe to source, revision, and selected tuple', () => {
    const tuple = { first: 1, middle: 4, last: 9 }
    expect(keyframeTupleHash(tuple)).toMatch(/^[a-f0-9]{64}$/)
    const descriptor = buildSceneDetectTaskDescriptor({ projectId: 'p1', sourceRevision: 2, shotRevision: 3, adapterVersion: 'v1', operationKey: 'extract', operation: 'extract_keyframes', frameTuple: tuple })
    expect(descriptor.dedupeKey).toContain(':1:4:9')
  })
})
