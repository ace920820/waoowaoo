'use client'

import { useState, useEffect, useMemo } from 'react'
import { AppIcon } from '@/components/ui/icons'
import type { RemakeShotView } from '@/lib/remake-projects/keyframes/adapter'
import { REMAKE_KEYFRAME_SLOTS } from '@/lib/remake-projects/keyframes/adapter'
import { useUpdateRemakeShotSemantics } from '@/lib/query/mutations/remake-keyframe-mutations'
import { DEFAULT_STORYBOARD_MOOD_PRESETS, resolveStoryboardMoodPreset } from '@/lib/storyboard-mood-presets'

type Props = {
  projectId: string
  shot: RemakeShotView
}

export default function ShotSemanticsPanel({ projectId, shot }: Props) {
  const semantics = shot.semantics
  const update = useUpdateRemakeShotSemantics(projectId)
  const [editing, setEditing] = useState(false)
  const [localShotType, setLocalShotType] = useState(semantics.shotType ?? '')
  const [localCameraMove, setLocalCameraMove] = useState(semantics.cameraMove ?? '')
  const [localDescription, setLocalDescription] = useState(semantics.description ?? '')
  const [localMoodPresetId, setLocalMoodPresetId] = useState(semantics.moodPresetId ?? '')
  const [localCustomMood, setLocalCustomMood] = useState(semantics.customMood ?? '')
  const [localSceneTag, setLocalSceneTag] = useState(semantics.sceneTag ?? '')
  const [localCharacterTags, setLocalCharacterTags] = useState(semantics.characterTags.join(', '))

  const moodPreset = useMemo(
    () => resolveStoryboardMoodPreset(DEFAULT_STORYBOARD_MOOD_PRESETS, semantics.moodPresetId),
    [semantics.moodPresetId],
  )

  useEffect(() => {
    setLocalShotType(semantics.shotType ?? '')
    setLocalCameraMove(semantics.cameraMove ?? '')
    setLocalDescription(semantics.description ?? '')
    setLocalMoodPresetId(semantics.moodPresetId ?? '')
    setLocalCustomMood(semantics.customMood ?? '')
    setLocalSceneTag(semantics.sceneTag ?? '')
    setLocalCharacterTags(semantics.characterTags.join(', '))
  }, [shot.id, semantics.shotType, semantics.cameraMove, semantics.description,
      semantics.moodPresetId, semantics.customMood, semantics.sceneTag, semantics.characterTags])

  const hasChanges = editing && (
    localShotType !== (semantics.shotType ?? '') ||
    localCameraMove !== (semantics.cameraMove ?? '') ||
    localDescription !== (semantics.description ?? '') ||
    localMoodPresetId !== (semantics.moodPresetId ?? '') ||
    localCustomMood !== (semantics.customMood ?? '') ||
    localSceneTag !== (semantics.sceneTag ?? '') ||
    localCharacterTags !== semantics.characterTags.join(', ')
  )

  const handleSave = () => {
    const patch: Record<string, unknown> = {
      shotType: localShotType.trim() || null,
      cameraMove: localCameraMove.trim() || null,
      description: localDescription.trim() || null,
      moodPresetId: localMoodPresetId.trim() || null,
      customMood: localCustomMood.trim() || null,
      sceneTag: localSceneTag.trim() || null,
      characterTags: localCharacterTags
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    }
    void update.mutateAsync({ shotId: shot.id, patch }).then(() => setEditing(false))
  }

  const handleCancel = () => {
    setLocalShotType(semantics.shotType ?? '')
    setLocalCameraMove(semantics.cameraMove ?? '')
    setLocalDescription(semantics.description ?? '')
    setLocalMoodPresetId(semantics.moodPresetId ?? '')
    setLocalCustomMood(semantics.customMood ?? '')
    setLocalSceneTag(semantics.sceneTag ?? '')
    setLocalCharacterTags(semantics.characterTags.join(', '))
    setEditing(false)
  }

  const promptHref = `?stage=prompt&shot=${encodeURIComponent(shot.id)}`

  return (
    <section
      aria-labelledby={`${shot.id}-semantics`}
      className="rounded-lg border border-slate-200 bg-slate-50/50 p-4"
      data-testid={`remake-shot-semantics-${shot.id}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h4 id={`${shot.id}-semantics`} className="text-sm font-bold text-slate-800">
          镜头语义
        </h4>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="min-h-8 rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || update.isPending}
                className="min-h-8 rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
              >
                {update.isPending ? '保存中…' : '保存'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="min-h-8 rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              <AppIcon name="edit" size={12} className="mr-1 inline" />
              编辑
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 镜头类型 */}
        <Field label="镜头类型">
          {editing ? (
            <input
              type="text"
              value={localShotType}
              onChange={(e) => setLocalShotType(e.target.value)}
              placeholder="例如：平视中景、越肩近景"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <ValueText value={semantics.shotType} placeholder="未设置" />
          )}
        </Field>

        {/* 镜头运动 */}
        <Field label="镜头运动">
          {editing ? (
            <input
              type="text"
              value={localCameraMove}
              onChange={(e) => setLocalCameraMove(e.target.value)}
              placeholder="例如：固定、微微摇晃、轻微跟随"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <ValueText value={semantics.cameraMove} placeholder="未设置" />
          )}
        </Field>

        {/* 画面描述 */}
        <Field label="画面描述" fullWidth>
          {editing ? (
            <textarea
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              rows={3}
              placeholder="描述主体动作、环境、镜头语言…"
              className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <ValueText value={semantics.description} placeholder="未设置" multiline />
          )}
        </Field>

        {/* 氛围预设 */}
        <Field label="分镜氛围" fullWidth>
          {editing ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <select
                  value={localMoodPresetId}
                  onChange={(e) => setLocalMoodPresetId(e.target.value)}
                  className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">— 不单独设置（使用项目默认）—</option>
                  {DEFAULT_STORYBOARD_MOOD_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                value={localCustomMood}
                onChange={(e) => setLocalCustomMood(e.target.value)}
                placeholder="自定义氛围描述（可选，将追加到预设之上）"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {localMoodPresetId ? (
                <p className="text-xs text-slate-500">
                  {resolveStoryboardMoodPreset(DEFAULT_STORYBOARD_MOOD_PRESETS, localMoodPresetId)?.prompt}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-1">
              {moodPreset ? (
                <div>
                  <p className="text-sm font-medium text-slate-700">{moodPreset.label}</p>
                  <p className="text-xs text-slate-500">{moodPreset.prompt}</p>
                </div>
              ) : (
                <p className="text-xs text-slate-400">未单独设置</p>
              )}
              {semantics.customMood ? (
                <p className="text-xs text-indigo-600">自定义：{semantics.customMood}</p>
              ) : null}
            </div>
          )}
        </Field>

        {/* 场景 */}
        <Field label="场景">
          {editing ? (
            <input
              type="text"
              value={localSceneTag}
              onChange={(e) => setLocalSceneTag(e.target.value)}
              placeholder="例如：机舱内部_白天"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <ValueText value={semantics.sceneTag} placeholder="未设置" />
          )}
        </Field>

        {/* 角色 */}
        <Field label="角色">
          {editing ? (
            <input
              type="text"
              value={localCharacterTags}
              onChange={(e) => setLocalCharacterTags(e.target.value)}
              placeholder="多个角色用逗号分隔"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <div className="flex flex-wrap gap-1">
              {semantics.characterTags.length > 0 ? (
                semantics.characterTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-400">未设置</span>
              )}
            </div>
          )}
        </Field>
      </div>

      {/* Prompt 状态与内容 */}
      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h5 className="text-xs font-bold text-slate-700">Prompt 状态</h5>
          <a
            href={promptHref}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            前往 Prompt 页 <AppIcon name="arrowRight" size={10} className="inline" />
          </a>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          {REMAKE_KEYFRAME_SLOTS.map((slot) => (
            <PromptStatusCard
              key={slot}
              label={`图片 ${slot.toUpperCase()}`}
              status={shot.imagePromptStatus[slot]}
              coreText={shot.imagePrompts[slot].coreText}
              href={promptHref}
            />
          ))}
          <PromptStatusCard
            label="视频"
            status={shot.videoPromptStatus}
            coreText={shot.videoPrompt.coreText}
            href={promptHref}
          />
        </div>
      </div>
    </section>
  )
}

function Field({
  label,
  children,
  fullWidth,
}: {
  label: string
  children: React.ReactNode
  fullWidth?: boolean
}) {
  return (
    <div className={fullWidth ? 'md:col-span-2' : ''}>
      <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  )
}

function ValueText({ value, placeholder, multiline }: { value: string | null; placeholder: string; multiline?: boolean }) {
  if (!value) {
    return <p className="text-xs text-slate-400">{placeholder}</p>
  }
  if (multiline) {
    return <p className="whitespace-pre-wrap text-sm text-slate-700">{value}</p>
  }
  return <p className="text-sm text-slate-700">{value}</p>
}

function PromptStatusCard({
  label,
  status,
  coreText,
  href,
}: {
  label: string
  status: 'approved' | 'missing' | 'needs_review'
  coreText: string | null
  href: string
}) {
  return (
    <a
      href={href}
      className="block rounded-md border border-slate-200 bg-white p-2 transition hover:border-indigo-300 hover:bg-indigo-50/30"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <StatusBadge status={status} />
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
        {coreText || '暂无已采用版本'}
      </p>
    </a>
  )
}

function StatusBadge({ status }: { status: 'approved' | 'missing' | 'needs_review' }) {
  if (status === 'approved') {
    return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">已批准</span>
  }
  if (status === 'needs_review') {
    return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">需复核</span>
  }
  return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">缺失</span>
}
