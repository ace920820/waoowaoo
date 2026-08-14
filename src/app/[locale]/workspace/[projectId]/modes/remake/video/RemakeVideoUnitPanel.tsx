'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppIcon } from '@/components/ui/icons'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import { useRefreshRemakeProject } from '@/lib/query/hooks'
import { adaptRemakeUnit } from '@/lib/remake-projects/unit/adapter'
import { buildUnitSubmissionPreview } from '@/lib/remake-projects/unit/preview'

function apiErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object') return fallback
  const body = data as { message?: unknown; details?: unknown; error?: { message?: unknown; details?: unknown } }
  if (typeof body.error?.message === 'string' && body.error.message.trim()) return body.error.message
  if (typeof body.message === 'string' && body.message.trim()) return body.message
  if (typeof body.details === 'string' && body.details.trim()) return body.details
  return fallback
}

/**
 * D-16/D-17/D-19 unit preview + version panel for the 成片页.
 *
 * - Preview is WYSIWYG: imports the same client-safe pure functions the
 *   server freezes (buildUnitSubmissionPreview), so the prompt text /
 *   reference order / total duration shown === what the model receives.
 * - Member edits (reorder/remove) are disabled once a generation task is
 *   pending (queued/processing/running) OR any batch is committed (D-19).
 * - Version loop (play/adopt/note/reconfirm) operates at unit granularity.
 */
export function RemakeVideoUnitPanel({
  projectId,
  snapshot,
  unitId,
  onExit,
}: {
  projectId: string
  snapshot: RemakeSnapshot
  unitId: string
  onExit?: () => void
}) {
  const refresh = useRefreshRemakeProject(projectId)
  const unit = useMemo(() => adaptRemakeUnit(snapshot, unitId), [snapshot, unitId])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editingMembers, setEditingMembers] = useState(false)
  const [memberOrder, setMemberOrder] = useState<string[]>([])
  const [noteText, setNoteText] = useState('')
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)

  useEffect(() => {
    if (!unit) return
    setMemberOrder(unit.members.map((member) => member.shotRevisionId))
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

  const frozen = Boolean(unit?.hasPendingGeneration || unit?.hasCommittedBatch)

  const orderedMembers = useMemo(() => {
    if (!unit) return []
    const byRevision = new Map(unit.members.map((member) => [member.shotRevisionId, member]))
    return memberOrder
      .map((revisionId) => byRevision.get(revisionId))
      .filter((member): member is NonNullable<typeof member> => Boolean(member))
  }, [unit, memberOrder])

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
      const keyframeMediaRef = { mediaId: null, mediaUrl: null }
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
      const res = await fetch(
        `/api/remake-projects/${encodeURIComponent(projectId)}/units/${encodeURIComponent(unit.id)}/members`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            members: memberOrder.map((shotRevisionId, index) => ({ shotRevisionId, ordinal: index + 1 })),
          }),
        },
      )
      if (!res.ok) throw new Error(apiErrorMessage(await res.json().catch(() => null), '保存成员失败'))
      setEditingMembers(false)
      await refresh()
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '保存成员失败')
    }
  }, [unit, projectId, memberOrder, refresh])

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
  }, [unit, projectId, preview, refresh])

  const adoptVersion = useCallback(
    async (versionId: string, confirmReplace = false) => {
      if (!unit?.track) return
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
    [unit, projectId, refresh],
  )

  const saveNote = useCallback(async () => {
    if (!unit?.track || !selectedVersionId) return
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
  }, [unit, projectId, selectedVersionId, noteText, refresh])

  const reconfirmVersion = useCallback(async () => {
    if (!unit?.track || !selectedVersionId) return
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
  }, [unit, projectId, selectedVersionId, refresh])

  if (!unit) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center text-sm text-zinc-400">
        Unit 不存在
      </div>
    )
  }

  const allVersions = unit.track?.batches.flatMap((batch) => batch.versions) ?? []
  const selectedVersion = allVersions.find((version) => version.id === selectedVersionId) ?? null

  return (
    <div className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AppIcon name="layers" className="size-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-100">合并 unit</h3>
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs text-violet-300">
            {unit.members.length} 个镜头 · 总时长约 {Math.round(preview?.totalDurationSeconds ?? 0)}s
          </span>
        </div>
        <button
          type="button"
          onClick={onExit}
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          返回单镜头
        </button>
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Members */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-medium text-zinc-400">成员镜头</h4>
          {!frozen && (
            <button
              type="button"
              onClick={() => setEditingMembers((value) => !value)}
              className="text-xs text-violet-300 hover:text-violet-200"
            >
              {editingMembers ? '取消编辑' : '调整成员'}
            </button>
          )}
        </div>
        <div className="space-y-2">
          {orderedMembers.map((member, index) => (
            <div
              key={member.shotRevisionId}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2"
            >
              <span className="w-6 text-xs text-zinc-500">{index + 1}</span>
              <span className="text-sm text-zinc-200">{member.label ?? `镜头${member.sequence ?? '?'}`}</span>
              <span className="text-xs text-zinc-500">{member.durationSeconds.toFixed(1)}s</span>
              <div className="ml-auto flex items-center gap-1">
                {editingMembers && !frozen && (
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
          ))}
        </div>
        {editingMembers && !frozen && (
          <button
            type="button"
            onClick={persistMembers}
            className="mt-2 rounded-lg bg-violet-600/80 px-3 py-1 text-xs text-white hover:bg-violet-600"
          >
            保存成员顺序
          </button>
        )}
        {frozen && (
          <p className="mt-2 text-xs text-zinc-500">
            成员已冻结（{unit.hasPendingGeneration ? '生成任务进行中' : '已生成版本'}），不可编辑
          </p>
        )}
      </div>

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

      {/* Generate */}
      {orderedMembers.length >= 2 && !frozen && (
        <button
          type="button"
          disabled={submitting}
          onClick={handleGenerate}
          className="w-full rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {submitting ? '提交中…' : `生成 unit 视频（${preview?.totalDurationSeconds ?? '?'}s）`}
        </button>
      )}

      {/* Version list (D-17) */}
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
                    {version.id !== unit.track?.adoptedVersionId && (
                      <button
                        type="button"
                        onClick={() => adoptVersion(version.id)}
                        className="rounded bg-violet-600/70 px-2 py-0.5 text-xs text-white hover:bg-violet-600"
                      >
                        采用
                      </button>
                    )}
                    {version.id === unit.track?.adoptedVersionId && version.invalidated && (
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

          {/* Note editor */}
          {selectedVersion && (
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
