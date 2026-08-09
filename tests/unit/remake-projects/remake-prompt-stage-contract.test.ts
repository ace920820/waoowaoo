import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { getPromptTaskState } from '@/app/[locale]/workspace/[projectId]/modes/remake/prompt/prompt-review-state'

const stagePath = 'src/app/[locale]/workspace/[projectId]/modes/remake/prompt/PromptStage.tsx'
const imagePath = 'src/app/[locale]/workspace/[projectId]/modes/remake/prompt/PromptImageTab.tsx'
const videoPath = 'src/app/[locale]/workspace/[projectId]/modes/remake/prompt/PromptVideoTab.tsx'

describe('remake prompt stage contract', () => {
  it('composes separate server-driven image and video review tabs', () => {
    const stage = readFileSync(stagePath, 'utf8')
    const image = readFileSync(imagePath, 'utf8')
    const video = readFileSync(videoPath, 'utf8')

    expect(stage).toContain("from './PromptImageTab'")
    expect(stage).toContain("from './PromptVideoTab'")
    expect(image).toContain('useRemakePromptTrack')
    expect(image).toContain('useSaveRemakePromptVersion')
    expect(image).toContain('useApproveAndAdoptRemakePrompt')
    expect(video).toContain('useRemakePromptTrack')
    expect(video).toContain('useSaveRemakePromptVersion')
    expect(video).toContain('useApproveAndAdoptRemakePrompt')
  })

  it('keeps image analysis per-frame and video analysis project-level', () => {
    const image = readFileSync(imagePath, 'utf8')
    const video = readFileSync(videoPath, 'utf8')

    expect(image).toContain("kind: 'image'")
    expect(image).not.toMatch(/all frames|batch.?analy[sz]e/i)
    expect(video).not.toContain("kind: 'video'")
    expect(video).toContain('project-level video analysis')
  })

  it('renders version history and comparison without treating viewed content as adopted', () => {
    const image = readFileSync(imagePath, 'utf8')
    const video = readFileSync(videoPath, 'utf8')

    for (const source of [image, video]) {
      expect(source).toContain('versionHistory')
      expect(source).toContain('compare')
      expect(source).toContain('adoptedVersion')
      expect(source).toContain('needsReview')
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
})
