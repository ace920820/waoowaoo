'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { AppIcon } from '@/components/ui/icons'
import { GlassButton } from '@/components/ui/primitives'
import { resolveErrorDisplay } from '@/lib/errors/display'
import {
  useCreateProjectShotGroup,
  useDeleteProjectShotGroup,
  useGenerateProjectShotGroupImage,
  useUpdateProjectShotGroup,
  useUploadProjectShotGroupReferenceImage,
  useTaskTargetStateMap,
} from '@/lib/query/hooks'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import type { NovelPromotionShotGroup, NovelPromotionShotGroupTemplateKey } from '@/types/project'

interface ShotGroupSectionProps {
  projectId: string
  episodeId: string
  shotGroups: NovelPromotionShotGroup[]
}

interface DraftState {
  title: string
  templateKey: NovelPromotionShotGroupTemplateKey
  groupPrompt: string
}

const TEMPLATE_OPTIONS: Array<{ value: NovelPromotionShotGroupTemplateKey; label: string }> = [
  { value: 'grid-4', label: '4 宫格' },
  { value: 'grid-6', label: '6 宫格' },
  { value: 'grid-9', label: '9 宫格' },
]

function toDraft(group: NovelPromotionShotGroup): DraftState {
  return {
    title: group.title || '未命名镜头组',
    templateKey: (group.templateKey || 'grid-4') as NovelPromotionShotGroupTemplateKey,
    groupPrompt: group.groupPrompt || '',
  }
}

export default function ShotGroupSection({ projectId, episodeId, shotGroups }: ShotGroupSectionProps) {
  const createMutation = useCreateProjectShotGroup(projectId, episodeId)
  const updateMutation = useUpdateProjectShotGroup(projectId, episodeId)
  const deleteMutation = useDeleteProjectShotGroup(projectId, episodeId)
  const generateMutation = useGenerateProjectShotGroupImage(projectId, episodeId)
  const uploadMutation = useUploadProjectShotGroupReferenceImage(projectId, episodeId)
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({})
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const taskStatesQuery = useTaskTargetStateMap(projectId, shotGroups.map((group) => ({
    targetType: 'NovelPromotionShotGroup',
    targetId: group.id,
    types: ['image_shot_group'],
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
    setDrafts((previous) => {
      const next = { ...previous }
      for (const group of shotGroups) {
        next[group.id] = next[group.id] || toDraft(group)
      }
      return next
    })
  }, [shotGroups])

  const isEmpty = shotGroups.length === 0
  const creating = createMutation.isPending
  const deletingIds = useMemo(() => new Set<string>(), [])
  if (deleteMutation.variables?.shotGroupId && deleteMutation.isPending) {
    deletingIds.add(deleteMutation.variables.shotGroupId)
  }

  return (
    <section className="glass-surface p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[var(--glass-text-primary)]">
            <AppIcon name="clapperboard" className="h-4 w-4 text-[var(--glass-tone-info-fg)]" />
            <h3 className="text-sm font-semibold">镜头组（Phase 2）</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">
            已接入真实组图生成：模板 + 组提示词 + 参考图 → composite group image 回写，不影响现有单 panel 流程。
          </p>
        </div>
        <GlassButton
          size="sm"
          onClick={() => createMutation.mutate({ episodeId, templateKey: 'grid-4' })}
          disabled={creating}
        >
          <AppIcon name="plusAlt" className="h-3.5 w-3.5" />
          <span>{creating ? '创建中...' : '新建镜头组'}</span>
        </GlassButton>
      </div>

      {isEmpty ? (
        <div className="rounded-2xl border border-dashed border-[var(--glass-stroke-base)] px-4 py-8 text-center text-sm text-[var(--glass-text-tertiary)]">
          当前还没有镜头组。点击右上角即可创建一个 4 宫格镜头组并上传参考图开始生成。
        </div>
      ) : (
        <div className="space-y-4">
          {shotGroups.map((group) => {
            const draft = drafts[group.id] || toDraft(group)
            const isSaving = updateMutation.isPending && updateMutation.variables?.shotGroupId === group.id
            const isDeleting = deletingIds.has(group.id)
            const isGenerating = generateMutation.isPending && generateMutation.variables?.shotGroupId === group.id
            const isUploading = uploadMutation.isPending && uploadMutation.variables?.shotGroupId === group.id
            const taskState = taskStateById.get(group.id) || null
            const inlineState = taskState
              ? resolveTaskPresentationState({
                phase: taskState.phase,
                intent: taskState.intent,
                resource: 'image',
                hasOutput: Boolean(group.compositeImageUrl),
              })
              : null
            const errorDisplay = taskState?.lastError ? resolveErrorDisplay(taskState.lastError) : null

            return (
              <article key={group.id} className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <div className="flex items-center gap-2 text-sm text-[var(--glass-text-secondary)]">
                    <span className="rounded-lg bg-[var(--glass-tone-info-bg)] px-2 py-1 text-[var(--glass-tone-info-fg)]">
                      {TEMPLATE_OPTIONS.find((option) => option.value === draft.templateKey)?.label || draft.templateKey}
                    </span>
                    <span>{group.items?.length || 0} 个有序镜头槽位</span>
                    <TaskStatusInline state={inlineState} className="[&_svg]:text-[var(--glass-tone-info-fg)]" />
                  </div>
                  <div className="flex items-center gap-2">
                    <GlassButton
                      variant="ghost"
                      size="sm"
                      onClick={() => updateMutation.mutate({
                        shotGroupId: group.id,
                        title: draft.title,
                        templateKey: draft.templateKey,
                        groupPrompt: draft.groupPrompt || null,
                      })}
                      disabled={isSaving}
                    >
                      <AppIcon name="check" className="h-3.5 w-3.5" />
                      <span>{isSaving ? '保存中...' : '保存'}</span>
                    </GlassButton>
                    <GlassButton
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate({ shotGroupId: group.id })}
                      disabled={isDeleting}
                      className="text-[var(--glass-tone-danger-fg)]"
                    >
                      <AppIcon name="trash" className="h-3.5 w-3.5" />
                      <span>{isDeleting ? '删除中...' : '删除'}</span>
                    </GlassButton>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                      <label className="space-y-1 text-sm text-[var(--glass-text-secondary)]">
                        <span>标题</span>
                        <input
                          value={draft.title}
                          onChange={(event) => setDrafts((previous) => ({
                            ...previous,
                            [group.id]: {
                              ...draft,
                              title: event.target.value,
                            },
                          }))}
                          className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                          placeholder="例如：冲突升级九镜头"
                        />
                      </label>

                      <label className="space-y-1 text-sm text-[var(--glass-text-secondary)]">
                        <span>模板</span>
                        <select
                          value={draft.templateKey}
                          onChange={(event) => setDrafts((previous) => ({
                            ...previous,
                            [group.id]: {
                              ...draft,
                              templateKey: event.target.value as NovelPromotionShotGroupTemplateKey,
                            },
                          }))}
                          className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                        >
                          {TEMPLATE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="space-y-1 text-sm text-[var(--glass-text-secondary)] block">
                      <span>组提示词</span>
                      <textarea
                        value={draft.groupPrompt}
                        onChange={(event) => setDrafts((previous) => ({
                          ...previous,
                          [group.id]: {
                            ...draft,
                            groupPrompt: event.target.value,
                          },
                        }))}
                        rows={3}
                        className="w-full rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-3 py-2 text-sm text-[var(--glass-text-primary)] outline-none"
                        placeholder="例如：同一空间内从建立镜头推进到人物情绪爆发，保持电影感镜头语言与动作连续性。"
                      />
                    </label>

                    <div className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/50 p-3 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-[var(--glass-text-primary)]">参考图</div>
                          <div className="text-xs text-[var(--glass-text-tertiary)]">支持本地选择后上传，生成时会作为镜头组视觉锚点。</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            ref={(node) => {
                              fileInputRefs.current[group.id] = node
                            }}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              if (!file) return
                              uploadMutation.mutate({
                                file,
                                shotGroupId: group.id,
                                labelText: draft.title || group.title || '镜头组参考图',
                              })
                              event.currentTarget.value = ''
                            }}
                          />
                          <GlassButton
                            size="sm"
                            variant="ghost"
                            onClick={() => fileInputRefs.current[group.id]?.click()}
                            disabled={isUploading}
                          >
                            <AppIcon name="upload" className="h-3.5 w-3.5" />
                            <span>{isUploading ? '上传中...' : (group.referenceImageUrl ? '更换参考图' : '上传参考图')}</span>
                          </GlassButton>
                          {group.referenceImageUrl && (
                            <GlassButton
                              size="sm"
                              variant="ghost"
                              onClick={() => updateMutation.mutate({ shotGroupId: group.id, referenceImageUrl: null })}
                              disabled={isSaving}
                            >
                              <AppIcon name="close" className="h-3.5 w-3.5" />
                              <span>清空</span>
                            </GlassButton>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-xs text-[var(--glass-text-secondary)]">当前参考图</div>
                          <div className="aspect-video rounded-xl border border-dashed border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden flex items-center justify-center text-xs text-[var(--glass-text-tertiary)]">
                            {group.referenceImageUrl ? (
                              <img src={group.referenceImageUrl} alt={`${group.title} 参考图`} className="h-full w-full object-cover" />
                            ) : '暂无参考图'}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-xs text-[var(--glass-text-secondary)]">生成结果</div>
                          <div className="aspect-video rounded-xl border border-dashed border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] overflow-hidden flex items-center justify-center text-xs text-[var(--glass-text-tertiary)]">
                            {group.compositeImageUrl ? (
                              <img src={group.compositeImageUrl} alt={`${group.title} 分镜稿总图`} className="h-full w-full object-cover" />
                            ) : inlineState?.isRunning ? '正在生成 composite image...' : '尚未生成总图'}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <GlassButton
                          size="sm"
                          onClick={() => generateMutation.mutate({ shotGroupId: group.id })}
                          disabled={isGenerating || isUploading}
                        >
                          <AppIcon name="image" className="h-3.5 w-3.5" />
                          <span>{isGenerating ? '提交中...' : (group.compositeImageUrl ? '重新生成镜头组分镜稿' : '生成镜头组分镜稿')}</span>
                        </GlassButton>
                        <span className="text-xs text-[var(--glass-text-tertiary)]">
                          当前最小闭环先稳定回写 composite image；ordered items 保持接口位，后续可继续拆 item 级结果。
                        </span>
                      </div>

                      {errorDisplay?.message && (
                        <div className="rounded-xl border border-[var(--glass-tone-danger-border)] bg-[var(--glass-tone-danger-bg)] px-3 py-2 text-xs text-[var(--glass-tone-danger-fg)]">
                          {errorDisplay.message}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-[var(--glass-text-primary)]">模板槽位预览</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {(group.items || []).map((item) => (
                        <div key={item.id} className="rounded-xl border border-dashed border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/60 p-3">
                          <div className="text-xs font-medium text-[var(--glass-text-secondary)]">{item.title || `镜头 ${item.itemIndex + 1}`}</div>
                          <div className="mt-2 aspect-video rounded-lg bg-[var(--glass-bg-surface)] flex items-center justify-center text-[11px] text-[var(--glass-text-tertiary)]">
                            {item.imageUrl ? <img src={item.imageUrl} alt={item.title || `镜头 ${item.itemIndex + 1}`} className="h-full w-full object-cover rounded-lg" /> : `占位格 ${item.itemIndex + 1}`}
                          </div>
                        </div>
                      ))}
                    </div>
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
