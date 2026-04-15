'use client'

import { useEffect, useMemo, useState } from 'react'
import type { NovelPromotionShotGroup, NovelPromotionShotGroupTemplateKey } from '@/types/project'
import { AppIcon } from '@/components/ui/icons'
import { GlassButton } from '@/components/ui/primitives'
import {
  useCreateProjectShotGroup,
  useDeleteProjectShotGroup,
  useUpdateProjectShotGroup,
} from '@/lib/query/hooks'

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
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({})

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
            <h3 className="text-sm font-semibold">镜头组（Phase 1）</h3>
          </div>
          <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">
            先落地可见对象、模板 key、组提示词和占位镜头格，不影响现有单 panel 流程。
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
          当前还没有镜头组。点击右上角即可创建一个 4 宫格占位镜头组。
        </div>
      ) : (
        <div className="space-y-4">
          {shotGroups.map((group) => {
            const draft = drafts[group.id] || toDraft(group)
            const isSaving = updateMutation.isPending && updateMutation.variables?.shotGroupId === group.id
            const isDeleting = deletingIds.has(group.id)
            return (
              <article key={group.id} className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)]/70 p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-3 justify-between">
                  <div className="flex items-center gap-2 text-sm text-[var(--glass-text-secondary)]">
                    <span className="rounded-lg bg-[var(--glass-tone-info-bg)] px-2 py-1 text-[var(--glass-tone-info-fg)]">
                      {TEMPLATE_OPTIONS.find((option) => option.value === draft.templateKey)?.label || draft.templateKey}
                    </span>
                    <span>{group.items?.length || 0} 个占位镜头</span>
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
                      placeholder="给这个镜头组起个名字"
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

                <label className="block space-y-1 text-sm text-[var(--glass-text-secondary)]">
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
                    placeholder="例如：建立镜头 → 中景推进 → 特写收束，保持同一空间连续性"
                  />
                </label>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {(group.items || []).map((item) => (
                    <div key={item.id} className="rounded-xl border border-dashed border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/60 p-3">
                      <div className="text-xs font-medium text-[var(--glass-text-secondary)]">{item.title || `镜头 ${item.itemIndex + 1}`}</div>
                      <div className="mt-2 aspect-video rounded-lg bg-[var(--glass-bg-surface)] flex items-center justify-center text-[11px] text-[var(--glass-text-tertiary)]">
                        占位格 {item.itemIndex + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
