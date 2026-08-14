import fs from 'node:fs'
import path from 'node:path'
import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveTaskIntent } from '@/lib/task/intent'
import { getQueueTypeByTaskType } from '@/lib/task/queues'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { buildVideoUnitTaskDescriptor } from '@/lib/remake-projects/unit/task-contract'

const IDS = {
  projectId: '11111111-1111-4111-8111-111111111111',
  remakeProjectId: '22222222-2222-4222-8222-222222222222',
  unitId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  shotRevisionId1: '44444444-4444-4444-8444-444444444441',
  shotRevisionId2: '44444444-4444-4444-8444-444444444442',
  promptVersionId1: '55555555-5555-4555-8555-555555555551',
  promptVersionId2: '55555555-5555-4555-8555-555555555552',
  keyframeMedia1: '66666666-6666-4666-8666-666666666661',
  keyframeMedia2: '66666666-6666-4666-8666-666666666662',
  sheetMediaId: '66666666-6666-4666-8666-666666666663',
  audioMedia: '66666666-6666-4666-8666-666666666664',
  taskId: '88888888-8888-4888-8888-888888888888',
  userId: '99999999-9999-4999-8999-999999999999',
}

const baseSnapshot = {
  projectId: IDS.projectId,
  remakeProjectId: IDS.remakeProjectId,
  unitId: IDS.unitId,
  members: [
    {
      shotRevisionId: IDS.shotRevisionId1,
      ordinal: 1,
      selectedKeyframe: { slot: 'middle' as const, mediaId: IDS.keyframeMedia1 },
      promptVersionId: IDS.promptVersionId1,
      timeRangeSeconds: { start: 0, end: 2 },
    },
    {
      shotRevisionId: IDS.shotRevisionId2,
      ordinal: 2,
      selectedKeyframe: { slot: 'middle' as const, mediaId: IDS.keyframeMedia2 },
      promptVersionId: IDS.promptVersionId2,
      timeRangeSeconds: { start: 2, end: 5 },
    },
  ],
  orderedReferences: [
    { role: 'shot_keyframe' as const, ordinal: 1, mediaId: IDS.keyframeMedia1, mediaType: 'image' as const },
    { role: 'shot_keyframe' as const, ordinal: 2, mediaId: IDS.keyframeMedia2, mediaType: 'image' as const },
    { role: 'action_sheet' as const, ordinal: 3, mediaUrl: `unit-action-sheet://deferred/${'0'.repeat(64)}`, mediaType: 'image' as const },
  ],
  model: { id: 'video-model-v1', provider: 'ark' },
  options: { resolution: '720p', generateAudio: false },
  referenceMode: 'ark_content_multireference' as const,
  durationSeconds: 5,
  promptText: '这是按时间顺序切换的多镜头视频，各镜头之间为剪接切换（cut），不是连续运镜。',
}

const generation = vi.hoisted(() => ({
  resolveVideoSourceFromGeneration: vi.fn(async () => ({
    url: 'https://provider.example.com/unit.mp4',
    actualVideoTokens: 1200,
  })),
  uploadVideoSourceToCos: vi.fn(async () => 'remake/generated/unit-video-1.mp4'),
  assertTaskActive: vi.fn(async () => undefined),
}))
const unitService = vi.hoisted(() => ({
  assertVideoUnitSubmissionCurrent: vi.fn(async () => undefined),
  appendVideoUnitBatch: vi.fn(async () => ({
    batchId: 'batch-unit-1',
    versionIds: ['version-unit-1'],
  })),
}))
const actionSheet = vi.hoisted(() => ({
  renderAndPersistUnitActionSheet: vi.fn(async () => ({
    id: 'sheet-1',
    unitId: IDS.unitId,
    fingerprint: 'f'.repeat(64),
    mediaId: IDS.sheetMediaId,
    status: 'completed',
    reused: false,
  })),
}))
const videoService = vi.hoisted(() => ({
  resolveVideoUnitReferenceStorageKeys: vi.fn(async () => [
    { role: 'shot_keyframe', ordinal: 1, mediaId: IDS.keyframeMedia1, mediaType: 'image', signedUrl: 'https://cdn/member1.png' },
    { role: 'shot_keyframe', ordinal: 2, mediaId: IDS.keyframeMedia2, mediaType: 'image', signedUrl: 'https://cdn/member2.png' },
    { role: 'action_sheet', ordinal: 3, mediaType: 'image', mediaUrl: `unit-action-sheet://deferred/${'0'.repeat(64)}`, signedUrl: 'https://cdn/sheet.jpg' },
  ]),
}))
const media = vi.hoisted(() => ({
  ensureMediaObjectFromStorageKey: vi.fn(async (storageKey: string) => ({
    id: `media-${storageKey}`,
    storageKey,
    mimeType: 'video/mp4',
  })),
}))
const progress = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/media/outbound-image', () => ({
  normalizeToBase64ForGeneration: vi.fn(async (url: string) => `base64:${url}`),
}))
vi.mock('@/lib/workers/utils', () => ({
  resolveVideoSourceFromGeneration: generation.resolveVideoSourceFromGeneration,
  uploadVideoSourceToCos: generation.uploadVideoSourceToCos,
  assertTaskActive: generation.assertTaskActive,
}))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: progress }))
vi.mock('@/lib/remake-projects/unit/service', () => unitService)
vi.mock('@/lib/remake-projects/unit/action-sheet', () => actionSheet)
vi.mock('@/lib/remake-projects/video/service', () => videoService)
vi.mock('@/lib/media/service', () => media)

function buildJob(overrides: Partial<TaskJobData> = {}): Job<TaskJobData> {
  const descriptor = buildVideoUnitTaskDescriptor({
    projectId: IDS.projectId,
    operationKey: 'unit-gen-001',
    inputSnapshot: baseSnapshot,
  })
  return {
    id: IDS.taskId,
    data: {
      taskId: IDS.taskId,
      userId: IDS.userId,
      type: TASK_TYPE.REMAKE_VIDEO_UNIT_GENERATE,
      targetType: 'remake_unit',
      targetId: IDS.unitId,
      projectId: IDS.projectId,
      locale: 'zh',
      payload: descriptor.payload,
      status: 'processing',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as TaskJobData,
  } as Job<TaskJobData>
}

describe('remake video unit worker task type registration', () => {
  it('routes REMAKE_VIDEO_UNIT_GENERATE through the video queue (VIDEO_TYPES)', () => {
    expect(getQueueTypeByTaskType(TASK_TYPE.REMAKE_VIDEO_UNIT_GENERATE)).toBe('video')
  })

  it('maps REMAKE_VIDEO_UNIT_GENERATE to the generate intent', () => {
    expect(resolveTaskIntent(TASK_TYPE.REMAKE_VIDEO_UNIT_GENERATE)).toBe('generate')
  })
})

describe('shared Ark content-items helper (single-shot parity)', () => {
  it('exports buildArkContentItems + isImageReference from the shared worker module', async () => {
    const shared = await import('@/lib/workers/ark-content-items')
    expect(typeof shared.buildArkContentItems).toBe('function')
    expect(typeof shared.isImageReference).toBe('function')
  })

  it('single-shot handler imports the shared helper and no longer defines it inline', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/workers/handlers/remake-video.ts'),
      'utf8',
    )
    expect(source).toMatch(/ark-content-items/)
    expect(source).not.toMatch(/async function buildArkContentItems/)
  })
})
