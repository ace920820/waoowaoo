import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PromptImageTab } from '@/app/[locale]/workspace/[projectId]/modes/remake/prompt/PromptImageTab'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => values?.frame ?? key,
}))

vi.mock('@/components/ui/icons', () => ({
  AppIcon: ({ name, className }: { name: string; className?: string }) =>
    createElement('span', { 'data-icon': name, className }),
}))

vi.mock('@/lib/query/hooks/useRemakeProject', () => ({
  useRemakePromptTrack: () => ({ data: undefined }),
}))

vi.mock('@/lib/query/mutations/remake-prompt-mutations', () => ({
  useAnalyzeRemakePrompt: () => ({ isPending: false, mutate: vi.fn() }),
  useSaveRemakePromptVersion: () => ({ isPending: false, mutate: vi.fn() }),
  useApproveAndAdoptRemakePrompt: () => ({ isPending: false, mutate: vi.fn() }),
}))

const shot: RemakeSnapshot['shots'][number] = {
  id: 'shot-1', stableKey: 'shot-001', sequence: 1, reviewStatus: 'pending', needsReview: false,
  review: { promptEligible: true }, revisions: [], provenance: [],
  keyframes: {
    start: { mediaId: 'frame-1', mediaUrl: '/frame-1.jpg' },
    middle: { mediaId: 'frame-2', mediaUrl: '/frame-2.jpg' },
    end: { mediaId: 'frame-3', mediaUrl: '/frame-3.jpg' },
  },
}

describe('PromptImageTab generation state', () => {
  it.each(['queued', 'processing'] as const)('renders the in-image generation overlay for a persisted %s task', (status) => {
    Reflect.set(globalThis, 'React', React)
    const html = renderToStaticMarkup(createElement(PromptImageTab, {
      projectId: 'project-1', shot,
      tasks: [{ id: 'task-1', type: 'remake_image_prompt_analyze', targetType: 'remake_shot', targetId: shot.id, promptSlot: 'start', status, createdAt: '', updatedAt: '' }],
    }))

    expect(html).toContain('AI Prompt 分析生成中...')
    expect(html).toContain(status === 'queued' ? 'queued' : 'running')
    expect(html).toContain('backdrop-blur-sm')
    expect(html.match(/AI Prompt \u5206\u6790\u751f\u6210\u4e2d\.\.\./g)).toHaveLength(1)
  })

  it('does not render a generation overlay for an idle image card', () => {
    Reflect.set(globalThis, 'React', React)
    const html = renderToStaticMarkup(createElement(PromptImageTab, {
      projectId: 'project-1', shot, tasks: [],
    }))

    expect(html).not.toContain('AI Prompt 分析生成中...')
  })

  it('keeps a persisted middle-frame task off the start and end cards', () => {
    Reflect.set(globalThis, 'React', React)
    const tasks = [{
      id: 'task-middle', type: 'remake_image_prompt_analyze', targetType: 'remake_shot', targetId: shot.id,
      promptSlot: 'middle', status: 'queued', createdAt: '', updatedAt: '',
    }] as unknown as RemakeSnapshot['tasks']
    const html = renderToStaticMarkup(createElement(PromptImageTab, { projectId: 'project-1', shot, tasks }))

    expect(html.match(/AI Prompt \u5206\u6790\u751f\u6210\u4e2d\.\.\./g)).toHaveLength(1)
  })
})
