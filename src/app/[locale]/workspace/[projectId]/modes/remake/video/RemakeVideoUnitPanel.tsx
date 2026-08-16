'use client'

import React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { useProjectData, useRefreshRemakeProject } from '@/lib/query/hooks'
import { adaptRemakeUnit, unitToneForIndex } from '@/lib/remake-projects/unit/adapter'
import type { RemakeKeyframeSlotName } from '@/lib/remake-projects/unit/adapter'
import { buildUnitSubmissionPreview } from '@/lib/remake-projects/unit/preview'
import {
  useVideoGenerationParams,
  toCapabilityFieldLabel,
} from '@/lib/remake-projects/video/use-video-generation-params'
import {
  UnitDragWorkbench,
  buildUnitDragAssets,
  autoFillCells,
  type UnitGridDraft,
} from './UnitDragWorkbench'

function apiErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object') return fallback
  const body = data as { message?: unknown; details?: unknown; error?: { message?: unknown; details?: unknown } }
  if (typeof body.error?.message === 'string' && body.error.message.trim()) return body.error.message
  if (typeof body.message === 'string' && body.message.trim()) return body.message
  if (typeof body.details === 'string' && body.details.trim()) return body.details
  return fallback
}

/**
 * D-16/D-17/D-19 (revised) unit preview + version panel for the 成片页.
 *
 * - Preview is WYSIWYG: imports the same client-safe pure functions the
 *   server freezes (buildUnitSubmissionPreview), so the prompt text /
 *   reference order / total duration shown === what the model receives.
 * - Member edits are blocked ONLY while a generation task is pending
 *   (queued/processing/running). Committed batches no longer freeze members
 *   (D-19 revised): a member change invalidates the unit's own old completed
 *   versions (needs_review) instead.
 * - Dissolve (soft delete): the unit is stamped dissolvedAt, members are
 *   released (D-04), but tracks/batches/versions stay viewable. Confirm text
 *   warns when an adopted version exists.
 * - Version loop (play/adopt/note/reconfirm) operates at unit granularity
 *   and is read-only once the unit is dissolved.
 * - `unitId` = null renders the unit list (进行中 / 已解散 sections).
 */
export function RemakeVideoUnitPanel({
  projectId,
  snapshot,
  unitId,
  onExit,
  onCloseList,
  onOpenUnit,
}: {
  projectId: string
  snapshot: RemakeSnapshot
  unitId: string | null
  /** 详情视图的「返回」（回到列表 / 上级视图） */
  onExit?: () => void
  /** 列表视图的「返回」（收起整个 unit 管理区） */
  onCloseList?: () => void
  onOpenUnit?: (unitId: string) => void
}) {
  const refresh = useRefreshRemakeProject(projectId)
  const unit = useMemo(() => (unitId ? adaptRemakeUnit(snapshot, unitId) : null), [snapshot, unitId])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editingMembers, setEditingMembers] = useState(false)
  // Lazy-init so static/SSR renders (no effects) still show ordered members.
  const [memberOrder, setMemberOrder] = useState<string[]>(() =>
    unit ? unit.members.map((member) => member.shotRevisionId) : [],
  )
  const [noteText, setNoteText] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  // 编辑成员引用关键帧 slot 的本地草稿（key: shotRevisionId）
  const [memberSlotDrafts, setMemberSlotDrafts] = useState<Record<string, RemakeKeyframeSlotName>>({})
  // 动作表 x 宫格草稿（编辑模式；null = 未进入编辑）
  const [gridDraft, setGridDraft] = useState<UnitGridDraft | null>(null)

  useEffect(() => {
    if (!unit) return
    setMemberOrder(unit.members.map((member) => member.shotRevisionId))
    setEditingMembers(false)
    setMemberSlotDrafts({})
    setGridDraft(null)
    const adopted = unit.track?.adoptedVersionId ?? null
    const firstVersion = unit.track?.batches[0]?.versions[0]?.id ?? null
    setSelectedVersionId((current) => {
      if (current && unit.track?.batches.some((b) => b.versions.some((v) => v.id === current))) {
        return current
      }
      return adopted ?? firstVersion
    })
    setNoteText(unit.track?.batches
      .flatMap((batch) => batch.versions)
      .find((version) => version.id === selectedVersionId)?.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit?.id, unit?.track?.adoptedVersionId])

  // D-19 (revised): only a pending/running generation task freezes the
  // member set. Committed batches are editable (changes invalidate old versions).
  const frozen = Boolean(unit?.hasPendingGeneration)
  const dissolved = Boolean(unit?.dissolvedAt)
  const readOnly = dissolved

  const orderedMembers = useMemo(() => {
    if (!unit) return []
    const byRevision = new Map(unit.members.map((member) => [member.shotRevisionId, member]))
    return memberOrder
      .map((revisionId) => byRevision.get(revisionId))
      .filter((member): member is NonNullable<typeof member> => Boolean(member))
  }, [unit, memberOrder])

  // Phase 09.3: 拖拽工作台数据 —— 素材抽屉 + 引用槽。
  const dragAssets = useMemo(
    () => buildUnitDragAssets(snapshot, orderedMembers),
    [snapshot, orderedMembers],
  )
  const dockSlots = useMemo(
    () =>
      orderedMembers.map((member) => {
        const activeSlot = memberSlotDrafts[member.shotRevisionId] ?? member.keyframeSlot ?? 'middle'
        const activeRef = member.keyframeOptions.find((option) => option.slot === activeSlot) ?? null
        const shot = snapshot.shots.find((entry) => entry.id === member.shotId)
        return {
          shotRevisionId: member.shotRevisionId,
          shotNumber: member.sequence ?? member.ordinal,
          durationSeconds: member.durationSeconds,
          activeSlot,
          thumbMediaUrl: shot?.keyframes?.middle?.mediaUrl ?? null,
          refMediaUrl: activeRef?.mediaUrl ?? null,
          options: member.keyframeOptions,
        }
      }),
    [orderedMembers, memberSlotDrafts, snapshot.shots],
  )

  const initialGridDraft = useCallback((): UnitGridDraft => {
    if (unit?.actionSheetGrid) {
      return {
        columns: unit.actionSheetGrid.columns,
        cells: unit.actionSheetGrid.cells.map((cell) => ({
          id: `${cell.slot}:${cell.mediaId ?? ''}`,
          shotNumber: cell.shotNumber,
          slot: cell.slot,
          mediaId: cell.mediaId ?? '',
          mediaUrl: cell.mediaUrl ?? '',
        })),
      }
    }
    return { columns: 3, cells: autoFillCells(dragAssets) }
  }, [unit?.actionSheetGrid, dragAssets])

  // Phase 09.3: 动作参考表实时预览 —— 编辑模式下按当前草稿（debounced）请求
  // 服务端合成图；生成前即可查看/下载最终动作参考表。
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!unit || !editingMembers || !gridDraft || gridDraft.cells.length < 2) {
      setPreviewUrl(null)
      return
    }
    const timer = setTimeout(() => {
      const gridJson = JSON.stringify({
        columns: gridDraft.columns,
        cells: gridDraft.cells.map((cell) => ({
          shotNumber: cell.shotNumber,
          slot: cell.slot,
          mediaId: cell.mediaId,
        })),
      })
      setPreviewUrl(
        `/api/remake-projects/${encodeURIComponent(projectId)}/units/preview?unitId=${encodeURIComponent(unit.id)}&grid=${encodeURIComponent(gridJson)}`,
      )
    }, 400)
    return () => clearTimeout(timer)
  }, [unit?.id, editingMembers, gridDraft, projectId])

  // WYSIWYG preview — same pure functions the server freezes (D-16).
  const preview = useMemo(() => {
    if (!unit || orderedMembers.length < 2) return null
    // The frozen prompt needs each member's adopted Video Prompt; the snapshot
    // units projection carries prompts only via shot promptTracks — resolve
    // them from the shots so the preview is truly WYSIWYG.
    const withPrompts = orderedMembers.map((member) => {
      const shot = snapshot.shots.find((entry) => entry.id === member.shotId)
      const adoptedPrompt = shot?.promptTracks?.find((track) => track.targetKey === 'video')
        ?.adoptedVersion?.coreText ?? ''
      // 真实引用：该成员当前 slot 的已采用关键帧（Phase 09.2）
      const activeSlot = member.keyframeSlot ?? 'middle'
      const activeRef = member.keyframeOptions.find((option) => option.slot === activeSlot) ?? null
      const keyframeMediaRef = activeRef
        ? { mediaId: activeRef.mediaId, mediaUrl: activeRef.mediaUrl }
        : { mediaId: null, mediaUrl: null }
      return { ...member, adoptedPrompt, keyframeMediaRef }
    })
    return buildUnitSubmissionPreview({
      members: withPrompts.map((member, index) => ({
        ordinal: index + 1,
        durationSeconds: member.durationSeconds,
        adoptedPrompt: member.adoptedPrompt,
        keyframeMediaRef: member.keyframeMediaRef,
      })),
      actionSheetMediaRef: unit.actionSheets[0]
        ? { mediaId: unit.actionSheets[0].mediaId, mediaUrl: unit.actionSheets[0].mediaUrl }
        : null,
    })
  }, [unit, orderedMembers, snapshot.shots])

  // Phase 09.3: 本次生成参数（与成片页共享 hook；覆盖项目默认，不回写）
  const projectQuery = useProjectData(projectId)
  const projectConfig = (projectQuery.data?.novelPromotionData ?? {}) as Record<string, unknown>
  const defaultVideoModel = typeof projectConfig.videoModel === 'string' ? projectConfig.videoModel : ''
  const capabilityOverrides = projectConfig.capabilityOverrides as Record<string, unknown> | undefined
  const unitDurationSeconds = useMemo(
    () => orderedMembers.reduce((sum, member) => sum + member.durationSeconds, 0),
    [orderedMembers],
  )
  const {
    videoModelOptions,
    selectedModel,
    handleModelChange,
    visibleCapabilityFields,
    generationOptions,
    handleCapabilityChange,
  } = useVideoGenerationParams({
    projectId,
    shotDurationSeconds: unitDurationSeconds,
    defaultModel: defaultVideoModel,
    capabilityOverrides,
  })

  const moveMember = useCallback(
    (index: number, direction: -1 | 1) => {
      setMemberOrder((current) => {
        const next = [...current]
        const target = index + direction
        if (target < 0 || target >= next.length) return current
        ;[next[index], next[target]] = [next[target]!, next[index]!]
        return next
      })
    },
    [],
  )

  const removeMember = useCallback((revisionId: string) => {
    setMemberOrder((current) => current.filter((id) => id !== revisionId))
  }, [])

  const persistMembers = useCallback(async () => {
    if (!unit) return
    setErrorMsg(null)
    try {
      // 1) 成员顺序 + 引用关键帧 slot（现有 members 通道）
      const res = await fetch(
        `/api/remake-projects/${encodeURIComponent(projectId)}/units/${encodeURIComponent(unit.id)}/members`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            members: memberOrder.map((shotRevisionId, index) => ({
              shotRevisionId,
              ordinal: index + 1,
              ...(shotRevisionId in memberSlotDrafts
                ? { keyframeSlot: memberSlotDrafts[shotRevisionId] }
                : {}),
            })),
          }),
        },
      )
      if (!res.ok) throw new Error(apiErrorMessage(await res.json().catch(() => null), '保存成员失败'))

      // 2) 动作表 x 宫格布局（Phase 09.3 save-layout 通道）
      if (gridDraft) {
        const layoutRes = await fetch(
          `/api/remake-projects/${encodeURIComponent(projectId)}/units/${encodeURIComponent(unit.id)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'save-layout',
              actionSheetGrid: {
                columns: gridDraft.columns,
                cells: gridDraft.cells.map((cell) => ({
                  shotNumber: cell.shotNumber,
                  slot: cell.slot,
                  mediaId: cell.mediaId,
                })),
              },
            }),
          },
        )
        if (!layoutRes.ok) {
          throw new Error(apiErrorMessage(await layoutRes.json().catch(() => null), '保存动作表布局失败'))
        }
      }

      setEditingMembers(false)
      setMemberSlotDrafts({})
      setGridDraft(null)
      await refresh()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '保存失败')
    }
  }, [unit, projectId, memberOrder, memberSlotDrafts, gridDraft, refresh])

  const handleGenerate = useCallback(async () => {
    if (!unit || !preview) return
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const res = await fetch(
        `/api/remake-projects/${encodeURIComponent(projectId)}/units/${encodeURIComponent(unit.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'generate',
            operationKey: `unit-gen-${Date.now()}`,
            // Phase 09.3: 本次生成参数（模型 + 能力选项，覆盖项目默认）
            ...(selectedModel ? { model: selectedModel } : {}),
            options: generationOptions,
          }),
        },
      )
      if (!res.ok) throw new Error(apiErrorMessage(await res.json().catch(() => null), '生成失败'))
      await refresh()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '生成失败')
    } finally {
      setSubmitting(false)
    }
  }, [unit, projectId, preview, refresh, selectedModel, generationOptions])

  const handleDissolve = useCallback(async () => {
    if (!unit) return
    const hasAdopted = Boolean(unit.track?.adoptedVersionId)
    const message = hasAdopted
      ? '该 unit 已有采用版本。解散后：\n'
        + '· 已生成的视频、版本与采用记录完整保留（仍可回看）\n'
        + '· 本 unit 不再生成新版本\n'
        + '· 成员镜头被释放，可重新用于单镜头生成或并入其他 unit\n\n'
        + '确定解散该 unit？'
      : '解散后：\n'
        + '· 已生成的视频与记录保留\n'
        + '· 成员镜头被释放，可重新用于单镜头生成或并入其他 unit\n\n'
        + '确定解散该 unit？'
    if (!window.confirm(message)) return
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const res = await fetch(
        `/api/remake-projects/${encodeURIComponent(projectId)}/units/${encodeURIComponent(unit.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'dissolve' }),
        },
      )
      if (!res.ok) throw new Error(apiErrorMessage(await res.json().catch(() => null), '解散失败'))
      await refresh()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '解散失败')
    } finally {
      setSubmitting(false)
    }
  }, [unit, projectId, refresh])

  const adoptVersion = useCallback(
    async (versionId: string, confirmReplace = false) => {
      if (!unit?.track || readOnly) return
      setErrorMsg(null)
      try {
        const res = await fetch(
          `/api/remake-projects/${encodeURIComponent(projectId)}/units/${encodeURIComponent(unit.id)}/tracks/${encodeURIComponent(unit.track.id)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'adopt', versionId, confirmReplace }),
          },
        )
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          const msg = apiErrorMessage(data, '采用失败')
          if (data && typeof data === 'object' && 'error' in data && String((data as { error?: unknown }).error).includes('REPLACE_CONFIRM')) {
            const confirmed = window.confirm('已有采用版本，确认替换？')
            if (confirmed) return await adoptVersion(versionId, true)
          }
          throw new Error(msg)
        }
        await refresh()
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : '采用失败')
      }
    },
    [unit, projectId, refresh, readOnly],
  )

  const saveNote = useCallback(async () => {
    if (!unit?.track || !selectedVersionId || readOnly) return
    setErrorMsg(null)
    try {
      const res = await fetch(
        `/api/remake-projects/${encodeURIComponent(projectId)}/video/units/tracks/${encodeURIComponent(unit.track.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'note', versionId: selectedVersionId, note: noteText }),
        },
      )
      if (!res.ok) throw new Error(apiErrorMessage(await res.json().catch(() => null), '保存备注失败'))
      await refresh()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '保存备注失败')
    }
  }, [unit, projectId, selectedVersionId, noteText, refresh, readOnly])

  const reconfirmVersion = useCallback(async () => {
    if (!unit?.track || !selectedVersionId || readOnly) return
    setErrorMsg(null)
    try {
      const res = await fetch(
        `/api/remake-projects/${encodeURIComponent(projectId)}/video/units/tracks/${encodeURIComponent(unit.track.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reconfirm', versionId: selectedVersionId }),
        },
      )
      if (!res.ok) throw new Error(apiErrorMessage(await res.json().catch(() => null), '重新确认失败'))
      await refresh()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '重新确认失败')
    }
  }, [unit, projectId, selectedVersionId, refresh, readOnly])

  // Unit-list mode: manage all units (进行中 / 已解散).
  if (!unitId || !unit) {
    return (
      <RemakeUnitList
        projectId={projectId}
        snapshot={snapshot}
        activeUnitId={unitId}
        onOpenUnit={onOpenUnit}
        onExit={onCloseList}
      />
    )
  }

  const allVersions = unit.track?.batches.flatMap((batch) => batch.versions) ?? []
  const selectedVersion = allVersions.find((version) => version.id === selectedVersionId) ?? null
  const canEditMembers = !frozen && !readOnly
  const canGenerate = !frozen && !readOnly && orderedMembers.length >= 2

  return (
    <div className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5" data-testid="unit-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AppIcon name="layers" className="size-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-100">合并 unit</h3>
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300">
            {unit.members.length} 个镜头 · 总时长约 {Math.round(preview?.totalDurationSeconds ?? 0)}s
          </span>
          {dissolved && (
            <span className="rounded-full bg-zinc-700/60 px-2 py-0.5 text-xs text-zinc-400">
              已解散
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!readOnly && (
            <button
              type="button"
              data-testid="dissolve-unit-button"
              disabled={submitting}
              onClick={handleDissolve}
              className="rounded-lg border border-red-500/30 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
            >
              解散 unit
            </button>
          )}
          <button
            type="button"
            onClick={onExit}
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            返回
          </button>
        </div>
      </div>

      {/* Unit switcher (Phase 09.2): #N chips, same tones as the shot overview */}
      {(snapshot.units ?? []).length > 1 && (
        <div
          data-testid="unit-switcher"
          className="flex items-center gap-1.5 overflow-x-auto pb-1"
        >
          {(snapshot.units ?? []).map((entry, index) => {
            const tone = unitToneForIndex(index)
            const current = entry.id === unit.id
            return (
              <button
                key={entry.id}
                type="button"
                data-testid={`unit-switcher-${entry.id}`}
                data-current={current ? 'true' : 'false'}
                onClick={() => onOpenUnit?.(entry.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  current
                    ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                    : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                #{index + 1}
                {entry.dissolvedAt && <span className="text-[10px] text-zinc-500">已解散</span>}
              </button>
            )
          })}
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {errorMsg}
        </div>
      )}

      {dissolved && (
        <div
          data-testid="unit-dissolved-banner"
          className="rounded-lg border border-zinc-700/60 bg-zinc-800/40 px-3 py-2 text-xs text-zinc-400"
        >
          已解散（{new Date(unit.dissolvedAt!).toLocaleString()}）
          {unit.dissolvedReason ? ` · 原因：${unit.dissolvedReason}` : ''} —— 资产保留、只读，
          成员镜头已释放可重新使用。
        </div>
      )}

      {/* Members */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-medium text-zinc-400">成员镜头与引用素材</h4>
          {canEditMembers && (
            <button
              type="button"
              data-testid="edit-members-button"
              onClick={() => {
                if (editingMembers) {
                  setEditingMembers(false)
                } else {
                  setGridDraft(initialGridDraft())
                  setEditingMembers(true)
                }
              }}
              className="text-xs text-violet-300 hover:text-violet-200"
            >
              {editingMembers ? '取消编辑' : '调整成员/关键帧（拖拽）'}
            </button>
          )}
        </div>
        {editingMembers && canEditMembers ? (
          <>
            <UnitDragWorkbench
              assets={dragAssets}
              dockSlots={dockSlots}
              grid={gridDraft ?? initialGridDraft()}
              onGridChange={setGridDraft}
              onReorderDock={(ordered) => setMemberOrder(ordered)}
              onSlotSelect={(shotRevisionId, slot) =>
                setMemberSlotDrafts((prev) => ({ ...prev, [shotRevisionId]: slot }))
              }
              previewUrl={previewUrl}
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                data-testid="save-member-layout-button"
                onClick={persistMembers}
                className="rounded-lg bg-violet-600/80 px-3 py-1 text-xs text-white hover:bg-violet-600"
              >
                保存成员与动作表布局
              </button>
              <span className="text-[10px] text-zinc-600">
                保存后旧版本将标记为「需复核」，重新生成即更新动作表
              </span>
            </div>
          </>
        ) : (
        <div className="space-y-2">
          {orderedMembers.map((member, index) => {
            const activeSlot = memberSlotDrafts[member.shotRevisionId] ?? member.keyframeSlot ?? 'middle'
            const activeRef = member.keyframeOptions.find((option) => option.slot === activeSlot) ?? null
            return (
              <div
                key={member.shotRevisionId}
                className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-xs text-zinc-500">{index + 1}</span>
                  {/* 当前引用关键帧缩略图（Phase 09.2） */}
                  <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded border border-zinc-800 bg-black">
                    {activeRef?.mediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={activeRef.mediaUrl}
                        alt={`${member.label ?? '镜头'} 引用关键帧`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center px-1 text-center text-[9px] leading-tight text-zinc-600">
                        无已采用关键帧
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-200">
                      {member.label ?? `镜头${member.sequence ?? '?'}`}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {member.durationSeconds.toFixed(1)}s · 引用 {activeSlot} 关键帧
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    {editingMembers && canEditMembers && (
                      <>
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveMember(index, -1)}
                          className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={index === orderedMembers.length - 1}
                          onClick={() => moveMember(index, 1)}
                          className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeMember(member.shotRevisionId)}
                          className="rounded px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-500/10"
                        >
                          移除
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {/* 引用关键帧 slot 单选（编辑模式，Phase 09.2） */}
                {editingMembers && canEditMembers && (
                  <div
                    data-testid={`member-slot-options-${member.shotRevisionId}`}
                    className="mt-2 flex items-center gap-2 border-t border-zinc-800/60 pt-2"
                  >
                    {(['start', 'middle', 'end'] as const).map((slot) => {
                      const option = member.keyframeOptions.find((entry) => entry.slot === slot) ?? null
                      const selected = activeSlot === slot
                      const disabled = !option?.mediaUrl
                      return (
                        <button
                          key={slot}
                          type="button"
                          disabled={disabled}
                          data-testid={`member-slot-${member.shotRevisionId}-${slot}`}
                          data-selected={selected ? 'true' : 'false'}
                          onClick={() =>
                            setMemberSlotDrafts((prev) => ({ ...prev, [member.shotRevisionId]: slot }))
                          }
                          className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-colors ${
                            selected
                              ? 'border-violet-500/60 bg-violet-500/15 text-violet-200'
                              : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                          } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                        >
                          {option?.mediaUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={option.mediaUrl} alt="" className="h-6 w-10 rounded object-cover" />
                          ) : (
                            <span className="h-6 w-10 rounded border border-dashed border-zinc-700 text-[9px] leading-6 text-zinc-600">
                              未采用
                            </span>
                          )}
                          {slot}
                        </button>
                      )
                    })}
                    <span className="text-[10px] text-zinc-600">切换该镜头引用的已采用关键帧</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        )}
        {frozen && (
          <p className="mt-2 text-xs text-zinc-500" data-testid="members-frozen-hint">
            生成任务进行中，成员暂不可编辑
          </p>
        )}
        {!frozen && unit.hasCommittedBatch && !readOnly && (
          <p className="mt-2 text-xs text-amber-400/80" data-testid="members-invalidate-hint">
            已生成过版本 —— 保存成员/关键帧变更后，旧版本将标记为「需复核」
          </p>
        )}
        {!frozen && !readOnly && (
          <p className="mt-2 text-[10px] text-zinc-600" data-testid="shot-order-readonly-hint">
            镜头顺序 = 视频中出现顺序（引用/时间锚点顺序）；点「调整成员/关键帧（拖拽）」可拖拽调整
          </p>
        )}
      </div>

      {/* 动作表（合并参考图，Phase 09.2；编辑模式在宫格编辑器中） */}
      {(!editingMembers || !canEditMembers) && (
      <div data-testid="unit-action-sheet-card">
        <h4 className="mb-2 text-xs font-medium text-zinc-400">动作表（合并参考图）</h4>
        {unit.actionSheets[0]?.mediaUrl ? (
          <div className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={unit.actionSheets[0].mediaUrl}
              alt="合并动作表"
              className="h-24 w-40 shrink-0 rounded border border-zinc-800 object-contain"
            />
            <div className="min-w-0 text-xs text-zinc-500">
              <p className="text-zinc-300">已完成 · {unit.actionSheets[0].status}</p>
              <p className="mt-1 break-all">
                fingerprint：{unit.actionSheets[0].fingerprint?.slice(0, 16) ?? '-'}…
              </p>
              <p className="mt-1 text-zinc-600">
                由成员已采用关键帧自动合并生成；调整成员/关键帧后重新生成即更新。
              </p>
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-500">
            尚未生成 —— 生成视频时按成员已采用关键帧自动合并渲染（6/9 宫格动作表），
            重新生成后此处自动更新。
          </p>
        )}
      </div>
      )}

      {/* Preview (D-16 WYSIWYG) */}
      {preview && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-zinc-400">生成预览（所见即所得）</h4>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300">
            {preview.promptText}
          </pre>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
            <span>参考图 {preview.referenceCounts.images} 张</span>
            <span>音频 {preview.referenceCounts.audio} 段</span>
            <span>总时长 {preview.totalDurationSeconds}s</span>
          </div>
        </div>
      )}

      {/* 生成参数（Phase 09.3，与成片页一致：本次覆盖，不回写项目默认） */}
      {canGenerate && (
        <div
          data-testid="unit-generation-params"
          className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
        >
          <p className="text-xs font-medium text-zinc-300">生成参数</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">默认使用项目配置，本次修改不影响项目默认值。</p>
          <label className="mt-2 block text-[11px] text-zinc-400">视频模型</label>
          <select
            value={selectedModel}
            onChange={(event) => handleModelChange(event.target.value)}
            data-testid="unit-model-select"
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-violet-500/50"
          >
            {videoModelOptions.length === 0 ? (
              <option value="">加载中...</option>
            ) : (
              videoModelOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            )}
          </select>
          {visibleCapabilityFields.length > 0 && (
            <div className="mt-2 space-y-2 border-t border-zinc-800/60 pt-2">
              {visibleCapabilityFields.map((field) => {
                const currentValue = generationOptions[field.field]
                const isBoolean =
                  field.options.length === 2 && field.options.every((o) => typeof o === 'boolean')
                return (
                  <div key={field.field} className="flex items-center justify-between gap-2">
                    <label className="text-[11px] text-zinc-400">
                      {toCapabilityFieldLabel(field.field)}
                    </label>
                    {isBoolean ? (
                      <label className="flex items-center gap-2 text-xs text-zinc-300">
                        <input
                          type="checkbox"
                          checked={Boolean(currentValue)}
                          onChange={(event) => handleCapabilityChange(field.field, event.target.checked)}
                          data-testid={`unit-capability-${field.field}`}
                        />
                        <span>{Boolean(currentValue) ? '开启' : '关闭'}</span>
                      </label>
                    ) : (
                      <select
                        value={String(currentValue ?? '')}
                        onChange={(event) => handleCapabilityChange(field.field, event.target.value)}
                        data-testid={`unit-capability-${field.field}`}
                        className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 outline-none focus:border-violet-500/50"
                      >
                        {field.options.map((opt) => (
                          <option key={String(opt)} value={String(opt)}>
                            {typeof opt === 'boolean' ? (opt ? '开启' : '关闭') : String(opt)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Generate / regenerate */}
      {canGenerate && (
        <button
          type="button"
          data-testid="generate-unit-button"
          disabled={submitting}
          onClick={handleGenerate}
          className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {submitting
            ? '提交中…'
            : `${unit.hasCommittedBatch ? '重新生成' : '生成'} unit 视频（${preview?.totalDurationSeconds ?? '?'}s）`}
        </button>
      )}

      {/* Version list (D-17) — read-only when dissolved */}
      {allVersions.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-medium text-zinc-400">版本</h4>
          <div className="space-y-2">
            {allVersions.map((version) => (
              <div
                key={version.id}
                className={`rounded-lg border px-3 py-2 ${
                  version.id === unit.track?.adoptedVersionId
                    ? 'border-violet-500/40 bg-violet-500/10'
                    : 'border-zinc-800 bg-zinc-950/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-200">v{version.ordinal}</span>
                  {version.mediaUrl && (
                    <video src={version.mediaUrl} controls className="h-14 w-24 rounded bg-black object-contain" />
                  )}
                  <span className="text-xs text-zinc-500">{version.status}</span>
                  {version.invalidated && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                      需复核
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedVersionId(version.id)}
                      className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800"
                    >
                      详情
                    </button>
                    {!readOnly && version.id !== unit.track?.adoptedVersionId && (
                      <button
                        type="button"
                        onClick={() => adoptVersion(version.id)}
                        className="rounded bg-violet-600/70 px-2 py-0.5 text-xs text-white hover:bg-violet-600"
                      >
                        采用
                      </button>
                    )}
                    {!readOnly && version.id === unit.track?.adoptedVersionId && version.invalidated && (
                      <button
                        type="button"
                        onClick={reconfirmVersion}
                        className="rounded bg-amber-600/70 px-2 py-0.5 text-xs text-white hover:bg-amber-600"
                      >
                        重新确认
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Note editor — hidden for dissolved units */}
          {selectedVersion && !readOnly && (
            <div className="mt-3 flex items-start gap-2">
              <input
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="审核备注…"
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-violet-500/50"
              />
              <button
                type="button"
                onClick={saveNote}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
              >
                保存备注
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Unit management list: 进行中 / 已解散 sections (D-19 revised).
 * Rendered by the panel when unitId is null, and embedded on the storyboard
 * page. `onOpenUnit` opens a unit's detail view; `onExit` returns to the
 * enclosing mode (single-shot) when the panel is used as a full view.
 */
export function RemakeUnitList({
  projectId,
  snapshot,
  activeUnitId,
  onOpenUnit,
  onExit,
}: {
  projectId: string
  snapshot: RemakeSnapshot
  activeUnitId?: string | null
  onOpenUnit?: (unitId: string) => void
  onExit?: () => void
}) {
  const units = useMemo(() => {
    return (snapshot.units ?? [])
      .map((entry) => adaptRemakeUnit(snapshot, entry.id))
      .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit))
  }, [snapshot])

  const activeUnits = units.filter((unit) => !unit.dissolvedAt)
  const dissolvedUnits = units.filter((unit) => Boolean(unit.dissolvedAt))

  const renderRow = (unit: NonNullable<typeof units[number]>) => {
    const totalDuration = unit.members.reduce((sum, member) => sum + member.durationSeconds, 0)
    const versionCount = unit.track?.batches.reduce((sum, batch) => sum + batch.versions.length, 0) ?? 0
    return (
      <div
        key={unit.id}
        data-testid={`unit-row-${unit.id}`}
        className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
          unit.id === activeUnitId
            ? 'border-violet-500/40 bg-violet-500/10'
            : 'border-zinc-800 bg-zinc-950/40'
        }`}
      >
        <AppIcon name="layers" className="size-3.5 shrink-0 text-zinc-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-zinc-200">
            {unit.userLabel ?? `Unit ${unit.id.slice(0, 8)}`}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {unit.members.length} 个镜头 · 约 {Math.round(totalDuration)}s
            {versionCount > 0 && ` · ${versionCount} 个版本`}
          </p>
        </div>
        {unit.track?.adoptedVersionId && (
          <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">
            已采用
          </span>
        )}
        {unit.track?.hasInvalidated && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
            需复核
          </span>
        )}
        {unit.dissolvedAt && (
          <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-[10px] text-zinc-400">
            已解散
          </span>
        )}
        <button
          type="button"
          onClick={() => onOpenUnit?.(unit.id)}
          className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200 hover:bg-zinc-700"
        >
          打开
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5" data-testid="unit-list">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AppIcon name="layers" className="size-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-100">合并 unit 管理</h3>
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
            {units.length} 个
          </span>
        </div>
        {onExit && (
          <button type="button" onClick={onExit} className="text-xs text-zinc-400 hover:text-zinc-200">
            返回
          </button>
        )}
      </div>

      {units.length === 0 && (
        <p className="text-center text-xs text-zinc-500" data-testid="unit-list-empty">
          还没有合并 unit —— 在「合并 unit 模式」中勾选镜头创建。
        </p>
      )}

      {activeUnits.length > 0 && (
        <div data-testid="unit-list-active">
          <h4 className="mb-2 text-xs font-medium text-zinc-400">进行中</h4>
          <div className="space-y-2">{activeUnits.map(renderRow)}</div>
        </div>
      )}

      {dissolvedUnits.length > 0 && (
        <div data-testid="unit-list-dissolved">
          <h4 className="mb-2 text-xs font-medium text-zinc-500">已解散（只读）</h4>
          <div className="space-y-2">{dissolvedUnits.map(renderRow)}</div>
        </div>
      )}
    </div>
  )
}
