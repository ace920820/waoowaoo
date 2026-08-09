import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { getPromptTaskState } from '@/app/[locale]/workspace/[projectId]/modes/remake/prompt/prompt-review-state'
import { findImagePromptTask } from '@/app/[locale]/workspace/[projectId]/modes/remake/prompt/PromptImageTab'

const stagePath = 'src/app/[locale]/workspace/[projectId]/modes/remake/prompt/PromptStage.tsx'
const imagePath = 'src/app/[locale]/workspace/[projectId]/modes/remake/prompt/PromptImageTab.tsx'
const videoPath = 'src/app/[locale]/workspace/[projectId]/modes/remake/prompt/PromptVideoTab.tsx'

describe('remake prompt stage contract', () => {
  it('renders the reference review workspace with keyframe and video prompt sections visible together', () => {
    const stage = readFileSync(stagePath, 'utf8')
    const image = readFileSync(imagePath, 'utf8')
    const video = readFileSync(videoPath, 'utf8')

    expect(stage).toContain("from './PromptImageTab'")
    expect(stage).toContain("from './PromptVideoTab'")
    expect(stage).not.toContain('prompt-tabs')
    expect(stage).toContain('grid grid-cols-1 lg:grid-cols-12 gap-6')
    expect(stage).toContain('lg:col-span-4')
    expect(stage).toContain('lg:col-span-8')
    expect(stage).toContain('grid grid-cols-1 md:grid-cols-3 gap-4')
    expect(image).toContain('useRemakePromptTrack')
    expect(image).toContain('useSaveRemakePromptVersion')
    expect(image).toContain('useApproveAndAdoptRemakePrompt')
    expect(video).toContain('useRemakePromptTrack')
    expect(video).toContain('useSaveRemakePromptVersion')
    expect(video).toContain('useApproveAndAdoptRemakePrompt')
  })

  it('keeps image analysis per-frame and video analysis project-level', () => {
    const stage = readFileSync(stagePath, 'utf8')
    const image = readFileSync(imagePath, 'utf8')
    const video = readFileSync(videoPath, 'utf8')

    expect(image).toContain("kind: 'image'")
    expect(image).toContain("state === 'queued'")
    expect(image).toContain('backdrop-blur-sm')
    expect(image).toContain('AI Prompt')
    expect(image).not.toMatch(/all frames|batch.?analy[sz]e/i)
    expect(video).toContain('project-level video analysis')
    expect(video).toContain('onAnalyzeVideo')
    expect(video).toContain("task?.status === 'queued'")
    expect(stage).toContain("kind: 'video'")
  })

  it('keeps the reference version-history, saving, and approval controls on real Prompt tracks', () => {
    const image = readFileSync(imagePath, 'utf8')
    const video = readFileSync(videoPath, 'utf8')

    for (const source of [image, video]) {
      expect(source).toContain('versionHistory')
      expect(source).toContain('needsReview')
      expect(source).toContain('useSaveRemakePromptVersion')
      expect(source).toContain('useApproveAndAdoptRemakePrompt')
    }
  })

  it('derives review state from server task and track facts', () => {
    const pendingTrack = { id: 'track-1', targetKey: 'image:start', latestVersion: { id: 'version-2', versionNumber: 2, reviewStatus: 'PENDING' }, adoptedVersion: { id: 'version-1', versionNumber: 1, reviewStatus: 'APPROVED' }, needsReview: false } as const

    expect(getPromptTaskState('queued', pendingTrack)).toBe('queued')
    expect(getPromptTaskState('processing', pendingTrack)).toBe('running')
    expect(getPromptTaskState('failed', pendingTrack)).toBe('failed')
    expect(getPromptTaskState(undefined, pendingTrack)).toBe('pending')
    expect(getPromptTaskState(undefined, { ...pendingTrack, needsReview: true })).toBe('needsReview')
    expect(getPromptTaskState(undefined, { ...pendingTrack, latestVersion: { ...pendingTrack.latestVersion, reviewStatus: 'APPROVED' } })).toBe('approved')
  })

  it('finds the persisted lowercase image Prompt task before its track exists', () => {
    const task = findImagePromptTask([{ id: 'task-1', type: 'remake_image_prompt_analyze', targetType: 'remake_shot', targetId: 'shot-1', status: 'queued', createdAt: '', updatedAt: '' }], null, 'shot-1')
    expect(task?.status).toBe('queued')
  })
})
