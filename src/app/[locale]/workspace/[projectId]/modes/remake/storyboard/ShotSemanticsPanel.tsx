'use client'

import { useState, useEffect, useMemo } from 'react'
import GlobalAssetPicker from '@/components/shared/assets/GlobalAssetPicker'
import type { AssetSummary, LocationAssetSummary, CharacterAssetSummary, PropAssetSummary } from '@/lib/assets/contracts' 
import { AppIcon } from '@/components/ui/icons'
import type { RemakeShotView } from '@/lib/remake-projects/keyframes/adapter'
import { REMAKE_KEYFRAME_SLOTS } from '@/lib/remake-projects/keyframes/adapter'
import { useUpdateRemakeShotSemantics } from '@/lib/query/mutations/remake-keyframe-mutations'
import { useSaveAndAdoptRemakePrompt } from '@/lib/query/mutations/remake-prompt-mutations'
import { DEFAULT_STORYBOARD_MOOD_PRESETS, resolveStoryboardMoodPreset } from '@/lib/storyboard-mood-presets'

type Props = {
  projectId: string
  shot: RemakeShotView
  activeSlot?: 'start' | 'middle' | 'end'
}

export default function ShotSemanticsPanel({ projectId, shot, activeSlot = "middle" }: Props & { activeSlot?: "start" | "middle" | "end" }) {
  const semantics = shot.semantics
  const update = useUpdateRemakeShotSemantics(projectId)
  const [editing, setEditing] = useState(false)
  const [localShotType, setLocalShotType] = useState(semantics.shotType ?? '')
  const [localCameraMove, setLocalCameraMove] = useState(semantics.cameraMove ?? '')
  const [localDescription, setLocalDescription] = useState(semantics.description ?? '')
  const [localMoodPresetId, setLocalMoodPresetId] = useState(semantics.moodPresetId ?? '')
  const [localCustomMood, setLocalCustomMood] = useState(semantics.customMood ?? '')
  const [localSceneTag, setLocalSceneTag] = useState(semantics.sceneTag ?? '')
  const [localSceneAssetId, setLocalSceneAssetId] = useState<string | null>(semantics.sceneAssetId ?? null)
  const [localCharacterAssetIds, setLocalCharacterAssetIds] = useState<string[]>(semantics.characterAssetIds ?? [])
  const [localPropAssetIds, setLocalPropAssetIds] = useState<string[]>(semantics.propAssetIds ?? [])
  const [localCharacterTags, setLocalCharacterTags] = useState(semantics.characterTags.join(', '))

  // 当前选中帧的图片 Prompt 编辑状态
  const currentPromptSlot = activeSlot
  const currentPromptTrackId = shot.imagePrompts[currentPromptSlot]?.trackId
  const currentPromptCoreText = shot.imagePrompts[currentPromptSlot]?.coreText
  const [editingPrompt, setEditingPrompt] = useState(false)
  const [localPromptText, setLocalPromptText] = useState(currentPromptCoreText ?? '')
  const saveAndAdoptPrompt = useSaveAndAdoptRemakePrompt(projectId, currentPromptTrackId ?? '')

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
    setLocalSceneAssetId(semantics.sceneAssetId ?? null)
    setLocalCharacterAssetIds(semantics.characterAssetIds ?? [])
    setLocalPropAssetIds(semantics.propAssetIds ?? [])
    setLocalCharacterTags(semantics.characterTags.join(', '))
    setLocalPromptText(currentPromptCoreText ?? '')
  }, [shot.id, semantics.shotType, semantics.cameraMove, semantics.description, currentPromptCoreText,
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
      sceneAssetId: localSceneAssetId || null,
      characterAssetIds: localCharacterAssetIds.length ? localCharacterAssetIds : null,
      propAssetIds: localPropAssetIds.length ? localPropAssetIds : null,
      sceneTag: localSceneTag.trim() || null,
      characterTags: localCharacterTags
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    }
    void update.mutateAsync({ shotId: shot.id, patch }).then(() => setEditing(false))
  }

  const handlePromptSave = async () => {
    if (!currentPromptTrackId) return
    await saveAndAdoptPrompt.mutateAsync({
      coreText: localPromptText.trim(),
    })
    setEditingPrompt(false)
  }

  const handlePromptCancel = () => {
    setLocalPromptText(currentPromptCoreText ?? '')
    setEditingPrompt(false)
  }

  const handleCancel = () => {
    setLocalShotType(semantics.shotType ?? '')
    setLocalCameraMove(semantics.cameraMove ?? '')
    setLocalDescription(semantics.description ?? '')
    setLocalMoodPresetId(semantics.moodPresetId ?? '')
    setLocalCustomMood(semantics.customMood ?? '')
    setLocalSceneTag(semantics.sceneTag ?? '')
    setLocalSceneAssetId(semantics.sceneAssetId ?? null)
    setLocalCharacterAssetIds(semantics.characterAssetIds ?? [])
    setLocalPropAssetIds(semantics.propAssetIds ?? [])
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

        {/* 画面描述 - 当前选中帧的图片 Prompt */}
        <Field label="画面描述" fullWidth>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">
              来自 {currentPromptSlot.toUpperCase()} 帧已采用 Prompt
              {shot.imagePromptStatus[currentPromptSlot] === 'approved' ? (
                <span className="ml-1 text-emerald-600">已采用</span>
              ) : shot.imagePromptStatus[currentPromptSlot] === 'needs_review' ? (
                <span className="ml-1 text-amber-600">需复核</span>
              ) : (
                <span className="ml-1 text-slate-400">缺失</span>
              )}
            </span>
            {editingPrompt ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={handlePromptCancel}
                  className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-600"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handlePromptSave}
                  disabled={!localPromptText.trim() || saveAndAdoptPrompt.isPending}
                  className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50"
                >
                  {saveAndAdoptPrompt.isPending ? '保存中…' : '保存并采用'}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingPrompt(true)}
                disabled={!currentPromptTrackId}
                className="text-[10px] font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-40"
              >
                编辑 Prompt
              </button>
            )}
          </div>
          {editingPrompt ? (
            <textarea
              value={localPromptText}
              onChange={(e) => setLocalPromptText(e.target.value)}
              rows={4}
              placeholder="反推的画面描述 Prompt…"
              className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <ValueText value={currentPromptCoreText} placeholder="暂无已采用 Prompt" multiline />
          )}
        </Field>

        {/* 镜头语义描述 - 原 description 字段 */}
        <Field label="镜头语义描述" fullWidth>
          {editing ? (
            <textarea
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              rows={2}
              placeholder="主体动作、环境和叙事说明…"
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
        <Field label="场景" fullWidth>
          <SceneAssetSelector
            sceneAssetId={semantics.sceneAssetId}
            sceneTag={semantics.sceneTag}
            editing={editing}
            onSelect={(assetId, label) => {
              if (!editing) return
              setLocalSceneAssetId(assetId)
              setLocalSceneTag(label)
            }}
            onClear={() => {
              if (!editing) return
              setLocalSceneAssetId(null)
              setLocalSceneTag(null as unknown as string)
            }}
          />
        </Field>

        {/* 角色 */}
        <Field label="角色" fullWidth>
          <CharacterChipSelector
            characterAssetIds={semantics.characterAssetIds}
            characterTags={semantics.characterTags}
            editing={editing}
            onAddCharacter={(assetId, name) => {
              if (!editing) return
              setLocalCharacterAssetIds([...localCharacterAssetIds, assetId])
              if (!localCharacterTags.includes(name)) {
                setLocalCharacterTags(localCharacterTags ? `${localCharacterTags}, ${name}` : name)
              }
            }}
            onRemoveCharacter={(assetId) => {
              if (!editing) return
              setLocalCharacterAssetIds(localCharacterAssetIds.filter((id) => id !== assetId))
            }}
          />
        </Field>

        {/* 物品 */}
        <Field label="物品" fullWidth>
          <PropChipSelector
            propAssetIds={semantics.propAssetIds}
            editing={editing}
            onAddProp={(assetId) => {
              if (!editing) return
              setLocalPropAssetIds([...localPropAssetIds, assetId])
            }}
            onRemoveProp={(assetId) => {
              if (!editing) return
              setLocalPropAssetIds(localPropAssetIds.filter((id) => id !== assetId))
            }}
          />
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
              versionLabel={shot.imagePrompts[slot]?.coreText ? '已采用版本' : '暂无版本'}
              href={promptHref}
            />
          ))}
          <PromptStatusCard
            label="视频"
            status={shot.videoPromptStatus}
            versionLabel={shot.videoPrompt?.coreText ? '已采用版本' : '暂无版本'}
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
  href,
  versionLabel,
}: {
  label: string
  status: 'approved' | 'missing' | 'needs_review'
  href: string
  versionLabel?: string
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
      <p className="mt-1 text-[10px] text-slate-400">
        {versionLabel || '暂无版本'}
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


// ── Asset selection sub-components ──────────────────────────────────────────

function SceneAssetSelector({
  sceneAssetId,
  sceneTag,
  editing,
  onSelect,
  onClear,
}: {
  sceneAssetId: string | null
  sceneTag: string | null
  editing: boolean
  onSelect: (assetId: string, label: string) => void
  onClear: () => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const displayLabel = sceneTag || (sceneAssetId ? '已选择场景' : '未绑定场景，可继续生成')
  const isDefault = !sceneAssetId

  return (
    <div className="space-y-2">
      {editing ? (
        <>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm hover:border-indigo-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {sceneAssetId ? (
              <span className="text-slate-800">{displayLabel}</span>
            ) : (
              <span className="text-slate-400">— 跟随项目默认场景 —</span>
            )}
          </button>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>
              当前：{isDefault ? '跟随默认场景' : '本镜头单独指定'}
            </span>
            {sceneAssetId ? (
              <button
                type="button"
                onClick={onClear}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                清除
              </button>
            ) : null}
          </div>
          <GlobalAssetPicker
            isOpen={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSelect={(globalAssetId) => {
              onSelect(globalAssetId, '场景')
              setPickerOpen(false)
            }}
            type="location"
          />
        </>
      ) : (
        <div>
          {sceneAssetId ? (
            <p className="text-sm text-slate-700">{displayLabel}</p>
          ) : (
            <p className="text-xs text-slate-400">未绑定场景，可继续生成</p>
          )}
          <p className="mt-1 text-[11px] text-slate-500">
            当前：{isDefault ? '跟随默认场景' : '本镜头单独指定'}
          </p>
        </div>
      )}
    </div>
  )
}

function CharacterChipSelector({
  characterAssetIds,
  characterTags,
  editing,
  onAddCharacter,
  onRemoveCharacter,
}: {
  characterAssetIds: string[]
  characterTags: string[]
  editing: boolean
  onAddCharacter: (assetId: string, name: string) => void
  onRemoveCharacter: (assetId: string) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const hasCharacters = characterAssetIds.length > 0 || characterTags.length > 0

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {characterAssetIds.length > 0 ? (
          characterAssetIds.map((assetId, index) => (
            <button
              key={assetId}
              type="button"
              onClick={() => editing && onRemoveCharacter(assetId)}
              className={`group flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                editing
                  ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                  : 'bg-indigo-100 text-indigo-700'
              }`}
            >
              {characterTags[index] ?? `角色 ${index + 1}`}
              {editing ? (
                <AppIcon name="close" size={10} className="opacity-60 group-hover:opacity-100" />
              ) : null}
            </button>
          ))
        ) : characterTags.length > 0 ? (
          characterTags.map((tag, index) => (
            <span
              key={`tag-${index}`}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-400">未绑定角色，可继续生成</span>
        )}
      </div>
      {editing ? (
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>手动选择会覆盖系统预选</span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            + 添加角色
          </button>
        </div>
      ) : null}
      <GlobalAssetPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(globalAssetId) => {
          onAddCharacter(globalAssetId, '角色')
          setPickerOpen(false)
        }}
        type="character"
      />
    </div>
  )
}

function PropChipSelector({
  propAssetIds,
  editing,
  onAddProp,
  onRemoveProp,
}: {
  propAssetIds: string[]
  editing: boolean
  onAddProp: (assetId: string) => void
  onRemoveProp: (assetId: string) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {propAssetIds.length > 0 ? (
          propAssetIds.map((assetId, index) => (
            <button
              key={assetId}
              type="button"
              onClick={() => editing && onRemoveProp(assetId)}
              className={`group flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                editing
                  ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              物品 {index + 1}
              {editing ? (
                <AppIcon name="close" size={10} className="opacity-60 group-hover:opacity-100" />
              ) : null}
            </button>
          ))
        ) : (
          <span className="text-xs text-slate-400">未绑定物品，可继续生成</span>
        )}
      </div>
      {editing ? (
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>物品缺失时仍允许生成，由 Prompt 描述补足</span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            + 添加物品
          </button>
        </div>
      ) : null}
      <GlobalAssetPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(globalAssetId) => {
          onAddProp(globalAssetId)
          setPickerOpen(false)
        }}
        type="prop"
      />
    </div>
  )
}
