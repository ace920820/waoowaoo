'use client'

import * as React from 'react'
import type {
  StoryboardPackageImportCommitRequest,
  StoryboardPackageImportPreviewResult,
  StoryboardPackageImportPreviewSuccess,
} from '@/lib/query/hooks'

type T = (key: string, values?: Record<string, unknown>) => string

interface StoryboardPackageImportDialogProps {
  preview: StoryboardPackageImportPreviewResult | null
  filename: string | null
  isPreviewing: boolean
  isCommitting: boolean
  previewError: string | null
  commitError: string | null
  onCancel: () => void
  onConfirm: (payload: StoryboardPackageImportCommitRequest) => Promise<void> | void
  commitPayload: StoryboardPackageImportCommitRequest | null
  tScript: T
}

function snippet(value: string | null | undefined, max = 72) {
  const trimmed = value?.trim() || ''
  if (!trimmed) return ''
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

function PreviewSuccess({ preview, tScript }: { preview: StoryboardPackageImportPreviewSuccess; tScript: T }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-xs text-[var(--glass-text-secondary)] md:grid-cols-4">
        <div className="rounded-xl bg-[var(--glass-bg-muted)]/60 p-3">
          <div className="text-[var(--glass-text-tertiary)]">{tScript('storyboardPackageImport.preview.segments')}</div>
          <div className="mt-1 text-base font-semibold text-[var(--glass-text-primary)]">{preview.summary.totalSegments}</div>
        </div>
        <div className="rounded-xl bg-[var(--glass-bg-muted)]/60 p-3">
          <div className="text-[var(--glass-text-tertiary)]">{tScript('storyboardPackageImport.preview.create')}</div>
          <div className="mt-1 text-base font-semibold text-[var(--glass-text-primary)]">{preview.summary.createCount}</div>
        </div>
        <div className="rounded-xl bg-[var(--glass-bg-muted)]/60 p-3">
          <div className="text-[var(--glass-text-tertiary)]">{tScript('storyboardPackageImport.preview.update')}</div>
          <div className="mt-1 text-base font-semibold text-[var(--glass-text-primary)]">{preview.summary.updateCount}</div>
        </div>
        <div className="rounded-xl bg-[var(--glass-bg-muted)]/60 p-3">
          <div className="text-[var(--glass-text-tertiary)]">{tScript('storyboardPackageImport.preview.warnings')}</div>
          <div className="mt-1 text-base font-semibold text-[var(--glass-text-primary)]">{preview.summary.warningCount}</div>
        </div>
      </div>
      <div className="rounded-xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)]/40 p-3 text-xs text-[var(--glass-text-secondary)]">
        {tScript('storyboardPackageImport.preview.overwrite', {
          create: preview.summary.createCount,
          update: preview.summary.updateCount,
        })}
      </div>
      <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1">
        {preview.segments.map((segment) => {
          const allAssets = [
            ...segment.assetMatches.location,
            ...segment.assetMatches.characters,
            ...segment.assetMatches.props,
          ]
          return (
            <div key={segment.segmentId} className="rounded-2xl border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-[var(--glass-text-primary)]">{segment.order}. {segment.title}</div>
                  <div className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{segment.sceneLabel}</div>
                </div>
                <span className="rounded-full bg-[var(--glass-tone-info-bg)] px-2.5 py-1 text-xs text-[var(--glass-tone-info-fg)]">
                  {segment.action === 'create' ? tScript('storyboardPackageImport.preview.actionCreate') : tScript('storyboardPackageImport.preview.actionUpdate')}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-xs text-[var(--glass-text-secondary)] md:grid-cols-3">
                <span>{segment.targetDurationSec}s</span>
                <span>{segment.templateKey}</span>
                <span>{tScript('storyboardPackageImport.preview.shots', { count: segment.shotCount })}</span>
              </div>
              {allAssets.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {allAssets.map((asset) => (
                    <span
                      key={`${asset.assetType}:${asset.ref}`}
                      className={`rounded-full px-2.5 py-1 text-xs ${asset.status === 'matched'
                        ? 'bg-[var(--glass-tone-success-bg)] text-[var(--glass-tone-success-fg)]'
                        : 'bg-[var(--glass-tone-warning-bg)] text-[var(--glass-tone-warning-fg)]'}`}
                    >
                      {asset.label}: {asset.status === 'matched' ? tScript('storyboardPackageImport.preview.assetMatched') : tScript('storyboardPackageImport.preview.assetFallback')}
                    </span>
                  ))}
                </div>
              ) : null}
              {segment.warnings.length > 0 ? (
                <div className="mt-3 space-y-1 text-xs text-[var(--glass-tone-warning-fg)]">
                  {segment.warnings.map((warning) => <div key={warning}>{warning}</div>)}
                </div>
              ) : null}
              <div className="mt-3 text-xs text-[var(--glass-text-tertiary)]">
                {snippet(segment.warnings[0]) || tScript('storyboardPackageImport.preview.mediaPreserved')}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function StoryboardPackageImportDialog({
  preview,
  filename,
  isPreviewing,
  isCommitting,
  previewError,
  commitError,
  onCancel,
  onConfirm,
  commitPayload,
  tScript,
}: StoryboardPackageImportDialogProps) {
  if (!preview && !isPreviewing && !previewError) return null
  const canCommit = Boolean(preview?.ok && commitPayload && !isCommitting)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
      <div className="glass-surface-modal w-full max-w-4xl rounded-3xl border border-[var(--glass-stroke-base)] p-5 shadow-2xl shadow-black/25">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--glass-text-primary)]">{tScript('storyboardPackageImport.preview.title')}</h3>
            <p className="mt-1 text-xs text-[var(--glass-text-tertiary)]">{filename || tScript('storyboardPackageImport.preview.unknownFile')}</p>
          </div>
          <button type="button" className="glass-btn-base glass-btn-secondary px-3 py-2 text-sm" onClick={onCancel}>
            {tScript('storyboardPackageImport.actions.cancel')}
          </button>
        </div>

        {isPreviewing ? (
          <div className="rounded-2xl bg-[var(--glass-bg-muted)]/60 p-6 text-sm text-[var(--glass-text-secondary)]">
            {tScript('storyboardPackageImport.preview.loading')}
          </div>
        ) : previewError ? (
          <div className="rounded-2xl border border-[var(--glass-tone-danger-border)] bg-[var(--glass-tone-danger-bg)] p-4 text-sm text-[var(--glass-tone-danger-fg)]">
            {previewError}
          </div>
        ) : preview?.ok ? (
          <PreviewSuccess preview={preview} tScript={tScript} />
        ) : preview ? (
          <div className="rounded-2xl border border-[var(--glass-tone-danger-border)] bg-[var(--glass-tone-danger-bg)] p-4 text-sm text-[var(--glass-tone-danger-fg)]">
            <div className="font-semibold">{preview.error.message}</div>
            {preview.error.issues?.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {preview.error.issues.map((issue) => (
                  <li key={`${issue.path}:${issue.message}`}>{issue.path}: {issue.message}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {commitError ? (
          <div className="mt-3 rounded-xl border border-[var(--glass-tone-danger-border)] bg-[var(--glass-tone-danger-bg)] px-3 py-2 text-xs text-[var(--glass-tone-danger-fg)]">
            {commitError}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="glass-btn-base glass-btn-secondary px-4 py-2 text-sm" onClick={onCancel}>
            {tScript('storyboardPackageImport.actions.cancel')}
          </button>
          <button
            type="button"
            className="glass-btn-base glass-btn-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canCommit}
            onClick={() => commitPayload && onConfirm(commitPayload)}
          >
            {isCommitting ? tScript('storyboardPackageImport.actions.importing') : tScript('storyboardPackageImport.actions.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
