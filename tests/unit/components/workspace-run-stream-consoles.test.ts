import * as React from 'react'
import { createElement } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import WorkspaceRunStreamConsoles from '@/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceRunStreamConsoles'

const showToast = vi.fn()
let capturedStoryCardProps: Record<string, unknown> | null = null

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/llm-console/LLMStageStreamCard', () => ({
  __esModule: true,
  default: (props: { title: string }) => {
    if (props.title === 'runConsole.storyToScript') {
      capturedStoryCardProps = props as unknown as Record<string, unknown>
    }
    return createElement('section', null, `LLMStageStreamCard:${props.title}`)
  },
}))

vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({
    showToast,
  }),
}))

function createStreamState(overrides?: Partial<React.ComponentProps<typeof WorkspaceRunStreamConsoles>['storyToScriptStream']>) {
  return {
    status: 'running' as const,
    isVisible: true,
    isRecoveredRunning: true,
    stages: [],
    selectedStep: null,
    activeStepId: null,
    outputText: '',
    activeMessage: '',
    overallProgress: 0,
    isRunning: false,
    errorMessage: '',
    stop: () => undefined,
    reset: () => undefined,
    selectStep: () => undefined,
    retryStep: async () => ({
      runId: 'run-1',
      status: 'running',
      summary: null,
      payload: null,
      errorMessage: '',
    }),
    ...overrides,
  }
}

describe('WorkspaceRunStreamConsoles', () => {
  beforeEach(() => {
    showToast.mockReset()
    capturedStoryCardProps = null
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('shows fallback running console when a recovered run has no stages yet', () => {
    Reflect.set(globalThis, 'React', React)

    const html = renderToStaticMarkup(
      createElement(WorkspaceRunStreamConsoles, {
        storyToScriptStream: createStreamState(),
        scriptToStoryboardStream: createStreamState({
          status: 'idle',
          isVisible: false,
          isRecoveredRunning: false,
        }),
        storyToScriptConsoleMinimized: false,
        scriptToStoryboardConsoleMinimized: true,
        onStoryToScriptMinimizedChange: () => undefined,
        onScriptToStoryboardMinimizedChange: () => undefined,
      }),
    )

    expect(html).toContain('LLMStageStreamCard:runConsole.storyToScript')
  })

  it('shows a toast when retrying a step fails', async () => {
    const retryStep = vi.fn(async () => {
      throw new Error('retry request exploded')
    })
    Reflect.set(globalThis, 'window', {
      prompt: vi.fn(() => ''),
    })

    renderToStaticMarkup(
      createElement(WorkspaceRunStreamConsoles, {
        storyToScriptStream: createStreamState({
          retryStep,
        }),
        scriptToStoryboardStream: createStreamState({
          status: 'idle',
          isVisible: false,
          isRecoveredRunning: false,
        }),
        storyToScriptConsoleMinimized: false,
        scriptToStoryboardConsoleMinimized: true,
        onStoryToScriptMinimizedChange: () => undefined,
        onScriptToStoryboardMinimizedChange: () => undefined,
      }),
    )

    expect(capturedStoryCardProps).not.toBeNull()
    const onRetryStage = capturedStoryCardProps?.onRetryStage as ((stepId: string) => void) | undefined
    expect(typeof onRetryStage).toBe('function')

    await onRetryStage?.('failed-step')

    expect(retryStep).toHaveBeenCalledWith({
      stepId: 'failed-step',
      modelOverride: undefined,
      reason: 'user_retry_from_console',
    })
    expect(showToast).toHaveBeenCalledWith('retry request exploded', 'error', 8000)
  })
})
