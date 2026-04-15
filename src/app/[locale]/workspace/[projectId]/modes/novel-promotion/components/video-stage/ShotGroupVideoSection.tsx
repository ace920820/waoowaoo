'use client'

import { useEffect, useMemo, useState } from 'react'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { AppIcon } from '@/components/ui/icons'
import { GlassButton } from '@/components/ui/primitives'
import { resolveErrorDisplay } from '@/lib/errors/display'
import { useGenerateProjectShotGroupVideo, useTaskTargetStateMap } from '@/lib/query/hooks'
import type { VideoModelOption } from '@/lib/novel-promotion/stages/video-stage-runtime/types'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import type { NovelPromotionShotGroup } from '@/types/project'

interface ShotGroupVideoSectionProps {
  projectId: string
  episodeId: string
  shotGroups?: NovelPromotionShotGroup[]
  defaultVideoModel: string
  videoModelOptions?: VideoModelOption[]
}

function resolveStatusLabel(params: {
  hasComposite: boolean
  hasVideo: boolean
  isRunning: boolean
  isError: boolean
}) {
  if (!params.hasComposite) return '未接通'
  if (params.isRunning) return '生成中'
  if (params.isError) return '失败'
  if (params.hasVideo) return '已生成'
  return '待生成'
}

function resolveStatusClass(params: {
  hasComposite: boolean
  hasVideo: boolean
  isRunning: boolean
  isError: boolean
}) {
  if (!params.hasComposite) return 'bg-[var(--glass-bg-muted)] text-[var(--glass-text-secondary)]'
  if (params.isRunning) return 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)]'
  if (params.isError) return 'bg-[var(--glass-tone-danger-bg)] text-[var(--glass-tone-danger-fg)]'
  if (params.hasVideo) return 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
  return 'bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]'
}

export default function ShotGroupVideoSection({
  projectId,
  episodeId,
  shotGroups = [],
  defaultVideoModel,
  videoModelOptions = [],
}: ShotGroupVideoSectionProps) {
  const generateMutation = useGenerateProjectShotGroupVideo(projectId, episodeId)
  const [modelByGroupId, setModelByGroupId] = useState<Record<string, string>>({})

  const taskStatesQuery = useTaskTargetStateMap(projectId, shotGroups.map((group) => ({
    targetType: 'NovelPromotionShotGroup',
    targetId: group.id,
    types: ['video_shot_group'],
  })), { enabled: shotGroups.length > 0 })
  const taskStates = useMemo(() => taskStatesQuery.data || [], [taskStatesQuery.data])

  const taskStateById = useMemo(() => {
    const next = new Map<string, (typeof taskStates)[number]>()
    for (const state of taskStates) {
      next.set(state.targetId, state)
    }
    return next
  }, [taskStates])

  useEffect(() => {
    setModelByGroupId((previous) => {
      const next = { ...previous }
      for (const group of shotGroups) {
        next[group.id] = next[group.id] || group.videoModel || defaultVideoModel
      }
      return next
    })
  }, [defaultVideoModel, shotGroups])

  return (
    <section className="glass-surface p-4 space-y-4">
      <div className="flex items-center gap-2 text-[var(--glass-text-primary)]">
        <AppIcon name="film" className="h-4 w-4 text-[var(--glass-tone-info-fg)]" />
        <div>
          <h3 className="text-sm font-semibold">镜头组视频区（Phase 3）</h3>
          <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">
            已接通真实闭环：shot group composite image → 视频模型 → 长视频结果回写，不污染 panel.videoUrl。
          </p>
        </div>
      </div>

      {shotGroups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-stroke-base)] px-4 py-6 text-sm text-[var(--glass-text-tertiary)]">
          当前没有镜头组；先在 storyboard 阶段创建镜头组并生成组图，再回到这里生成组视频。
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {shotGroups.map((group) => {
            const selectedModel = modelByGroupId[group.id] || group.videoModel || defaultVideoModel
            const isSubmitting = generateMutation.isPending && generateMutation.variables?.shotGroupId === group.id
            const taskState = taskStateById.get(group.id) || null
            const inlineState = taskState
              ? resolveTaskPresentationState({
                phase: taskState.phase,
                intent: taskState.intent,
                resource: 'video',
                hasOutput: Boolean(group.videoUrl),
              })
              : null
            const errorDisplay = taskState?.lastError ? resolveErrorDisplay(taskState.lastError) : null
            const statusLabel = resolveStatusLabel({
              hasComposite: Boolean(group.compositeImageUrl),
              hasVideo: Boolean(group.videoUrl),
              isRunning: Boolean(inlineState?.isRunning),
              isError: Boolean(inlineState?.isError),
            })
            const statusClass = resolveStatusClass({
              hasComposite: Boolean(group.compositeImageUrl),
              hasVideo: Boolean(group.videoUrl),
              isRunning: Boolean(inlineState?.isRunning),
              isError: Boolean(inlineState?.isError),
            })

            return (
              <article key={group.id} className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-[var(--glass-text-primary)]">{group.title}</h4>
                      <span className={["rounded-lg px-2 py-1 text-xs", statusClass].join(' ')}>{statusLabel}</span>
                    </div>
                    <p className="text-xs text-[var(--glass-text-tertiary)]">
                      模板：{group.templateKey} · 槽位 {(group.items || []).length} 个 · 输入源：{group.videoSourceType === 'composite_image_mvp' ? 'Composite Image MVP' : 'Composite Image'}
                    </p>
                  </div>
                  <TaskStatusInline state={inlineState} className="[&_svg]:text-[var(--glass-tone-info-fg)]" />
                </div>

                <p className="text-sm text-[var(--glass-text-secondary)] line-clamp-3">
                  {group.groupPrompt || '还没有填写组提示词。'}
                </p>

                <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <div className="text-xs text-[var(--glass-text-tertiary)]">当前组图输入</div>
                    {group.compositeImageUrl ? (
                      <img
                        src={group.compositeImageUrl}
                        alt={`${group.title} composite`}
                        className="h-[180px] w-full rounded-2xl object-cover border border-[var(--glass-stroke-base)]"
                      />
                    ) : (
                      <div className="flex h-[180px] items-center justify-center rounded-2xl border border-dashed border-[var(--glass-stroke-base)] px-3 text-center text-xs text-[var(--glass-text-tertiary)]">
                        还没有 composite image；请先回到 storyboard 生成镜头组分镜稿。
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <label className="space-y-1 text-sm text-[var(--glass-text-secondary)] block">
                      <span>视频模型</span>
                      <select
                        value={selectedModel}
                        onChange={(event) => setModelByGroupId((previous) => ({
                          ...previous,
                          [group.id]: event.target.value,
                        }))}
                        className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                        disabled={videoModelOptions.length === 0}
                      >
                        {(videoModelOptions.length > 0 ? videoModelOptions : [{ value: defaultVideoModel, label: defaultVideoModel }]).map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <div className="flex flex-wrap items-center gap-2">
                      <GlassButton
                        size="sm"
                        onClick={() => generateMutation.mutate({
                          shotGroupId: group.id,
                          videoModel: selectedModel,
                        })}
                        disabled={isSubmitting || !group.compositeImageUrl || !selectedModel}
                      >
                        <AppIcon name="film" className="h-3.5 w-3.5" />
                        <span>{isSubmitting ? '提交中...' : (group.videoUrl ? '重新生成组视频' : '生成组视频')}</span>
                      </GlassButton>
                      {!group.compositeImageUrl ? (
                        <span className="text-xs text-[var(--glass-text-tertiary)]">缺少 composite image，暂不可提交。</span>
                      ) : null}
                    </div>

                    {errorDisplay ? (
                      <div className="rounded-xl border border-[var(--glass-tone-danger-border)] bg-[var(--glass-tone-danger-bg)]/70 px-3 py-2 text-xs text-[var(--glass-tone-danger-fg)]">
                        {errorDisplay.message}
                      </div>
                    ) : null}

                    {group.videoUrl ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-[var(--glass-text-tertiary)]">
                          <AppIcon name="play" className="h-3.5 w-3.5" />
                          <span>最近一次组视频结果</span>
                        </div>
                        <video
                          key={group.videoUrl}
                          src={group.videoUrl}
                          controls
                          className="w-full rounded-2xl border border-[var(--glass-stroke-base)] bg-black/30"
                        />
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[var(--glass-stroke-base)] px-4 py-6 text-sm text-[var(--glass-text-tertiary)]">
                        组视频结果将独立显示在这里，并独立承接在 shot group 上，不会回写到任何 panel。
                      </div>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
