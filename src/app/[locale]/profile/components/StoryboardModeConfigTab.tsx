'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import {
  createDefaultStoryboardModeSettings,
  DEFAULT_STORYBOARD_MODE_ID,
  normalizeStoryboardModeSettings,
  STORYBOARD_MODE_STORAGE_EVENT,
  STORYBOARD_MODE_STORAGE_KEY,
  type ShotGroupStoryboardModeDefinition,
  type ShotGroupStoryboardModeSettings,
} from '@/lib/shot-group/storyboard-mode-config'

function createModeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `storyboard-mode-${crypto.randomUUID()}`
  }
  return `storyboard-mode-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function readSettings() {
  if (typeof window === 'undefined') return createDefaultStoryboardModeSettings()
  try {
    const raw = window.localStorage.getItem(STORYBOARD_MODE_STORAGE_KEY)
    if (!raw) return createDefaultStoryboardModeSettings()
    return normalizeStoryboardModeSettings(JSON.parse(raw) as Partial<ShotGroupStoryboardModeSettings>)
  } catch {
    return createDefaultStoryboardModeSettings()
  }
}

function persistSettings(settings: ShotGroupStoryboardModeSettings) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORYBOARD_MODE_STORAGE_KEY, JSON.stringify(settings))
  window.dispatchEvent(new Event(STORYBOARD_MODE_STORAGE_EVENT))
}

export default function StoryboardModeConfigTab() {
  const [settings, setSettings] = useState<ShotGroupStoryboardModeSettings>(() => createDefaultStoryboardModeSettings())

  useEffect(() => {
    setSettings(readSettings())
  }, [])

  const modeCountLabel = useMemo(() => `当前共 ${settings.modes.length} 个分镜模式`, [settings.modes.length])

  const updateSettings = (updater: (current: ShotGroupStoryboardModeSettings) => ShotGroupStoryboardModeSettings) => {
    setSettings((current) => {
      const next = normalizeStoryboardModeSettings(updater(current))
      persistSettings(next)
      return next
    })
  }

  const addMode = () => {
    updateSettings((current) => ({
      ...current,
      modes: [
        ...current.modes,
        {
          id: createModeId(),
          label: `自定义模式 ${current.modes.length + 1}`,
          promptText: '请在这里填写新的分镜模式提示词。',
        },
      ],
    }))
  }

  const updateMode = (modeId: string, updater: (current: ShotGroupStoryboardModeDefinition) => ShotGroupStoryboardModeDefinition) => {
    updateSettings((current) => ({
      ...current,
      modes: current.modes.map((mode) => (mode.id === modeId ? updater(mode) : mode)),
    }))
  }

  const removeMode = (modeId: string) => {
    updateSettings((current) => {
      if (current.modes.length <= 1) return current
      const nextModes = current.modes.filter((mode) => mode.id !== modeId)
      return {
        modes: nextModes,
        defaultModeId: current.defaultModeId === modeId
          ? nextModes[0]?.id || DEFAULT_STORYBOARD_MODE_ID
          : current.defaultModeId,
      }
    })
  }

  const resetDefaults = () => {
    const next = createDefaultStoryboardModeSettings()
    setSettings(next)
    persistSettings(next)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--glass-stroke-base)] px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--glass-text-primary)]">分镜模式</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--glass-text-secondary)]">
              这里管理“分镜构图 / 景别 / 镜头组织方式”这一段固定模板。多镜头确认页只填写剧情内容，最终提交给模型的分镜参考表提示词会由“分镜模式提示词 + 剧情内容”自动拼接而成。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={addMode}
              className="glass-btn-base glass-btn-tone-info inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm"
            >
              <AppIcon name="plus" className="h-4 w-4" />
              新增模式
            </button>
            <button
              type="button"
              onClick={resetDefaults}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-4 py-2 text-sm text-[var(--glass-text-secondary)]"
            >
              恢复默认
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/35 px-4 py-3 text-sm text-[var(--glass-text-secondary)]">
          {modeCountLabel}。当前默认模式：
          <span className="ml-1 font-medium text-[var(--glass-text-primary)]">
            {settings.modes.find((mode) => mode.id === settings.defaultModeId)?.label || '未设置'}
          </span>
        </div>

        <div className="space-y-4">
          {settings.modes.map((mode, index) => {
            const isDefault = settings.defaultModeId === mode.id
            return (
              <article
                key={mode.id}
                className="rounded-3xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/75 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--glass-bg-muted)] px-3 py-1 text-xs text-[var(--glass-text-secondary)]">
                        模式 {index + 1}
                      </span>
                      {isDefault ? (
                        <span className="rounded-full bg-[var(--glass-tone-info-bg)] px-3 py-1 text-xs text-[var(--glass-tone-info-fg)]">
                          默认
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!isDefault ? (
                      <button
                        type="button"
                        onClick={() => updateSettings((current) => ({ ...current, defaultModeId: mode.id }))}
                        className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-xs text-[var(--glass-text-secondary)]"
                      >
                        设为默认
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeMode(mode.id)}
                      disabled={settings.modes.length <= 1}
                      className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-3 py-2 text-xs text-[var(--glass-text-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      删除
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4">
                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[var(--glass-text-primary)]">模式名称</span>
                    <input
                      value={mode.label}
                      onChange={(event) => updateMode(mode.id, (current) => ({ ...current, label: event.target.value }))}
                      className="w-full rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-4 py-3 text-sm text-[var(--glass-text-primary)] outline-none"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-medium text-[var(--glass-text-primary)]">分镜模式提示词</span>
                    <textarea
                      value={mode.promptText}
                      onChange={(event) => updateMode(mode.id, (current) => ({ ...current, promptText: event.target.value }))}
                      rows={14}
                      className="w-full resize-y rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-4 py-3 text-sm leading-6 text-[var(--glass-text-primary)] outline-none"
                    />
                  </label>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
