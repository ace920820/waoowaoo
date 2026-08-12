'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import { useAssetActions, useCopyProjectAssetFromGlobal } from '@/lib/query/hooks'
import { useImageGenerationCount } from '@/lib/image-generation/use-image-generation-count'
import ImageGenerationInlineCountButton from '@/components/image-generation/ImageGenerationInlineCountButton'
import { getImageGenerationCountOptions } from '@/lib/image-generation/count'
import GlobalAssetPicker from '@/components/shared/assets/GlobalAssetPicker'

export interface PropCreationModalProps {
  mode: 'asset-hub' | 'project'
  folderId?: string | null
  projectId?: string
  onClose: () => void
  onSuccess: () => void
}

export function PropCreationModal({
  mode,
  folderId,
  projectId,
  onClose,
  onSuccess,
}: PropCreationModalProps) {
  const t = useTranslations('assetModal')
  const actions = useAssetActions({
    scope: mode === 'asset-hub' ? 'global' : 'project',
    projectId,
    kind: 'prop',
  })
  const { count, setCount } = useImageGenerationCount('location')
  const [name, setName] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [artStyle, setArtStyle] = useState('american-comic')
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Import from asset hub mode (project mode only)
  const [createSource, setCreateSource] = useState<'manual' | 'from-hub'>('manual')
  const [hubPickerOpen, setHubPickerOpen] = useState(false)
  const [selectedHubAssetId, setSelectedHubAssetId] = useState<string | null>(null)
  const [selectedHubAssetName, setSelectedHubAssetName] = useState<string>('')
  const copyFromGlobal = useCopyProjectAssetFromGlobal(projectId || '')
  const submittingState = isSubmitting
    ? resolveTaskPresentationState({
      phase: 'processing',
      intent: 'generate',
      resource: 'image',
      hasOutput: false,
    })
    : null

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isSubmitting, onClose])

  const handleSubmit = async (generateAfterCreate: boolean) => {
    if (!name.trim()) return
    if (createSource === 'from-hub' && mode === 'project' && selectedHubAssetId) {
      // Create a project asset with the user's name, then copy from the selected global asset
      if (!projectId) return
      try {
        setIsSubmitting(true)
        const result = await actions.create({
          name: name.trim(),
          summary: name.trim(),
          description: name.trim(),
          folderId,
          artStyle,
        }) as { assetId?: string }
        if (!result.assetId) {
          throw new Error('Missing assetId from create response')
        }
        await copyFromGlobal.mutateAsync({
          type: 'prop',
          targetId: result.assetId,
          globalAssetId: selectedHubAssetId,
        })
        onSuccess()
        onClose()
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    if (!summary.trim() || !description.trim()) return
    try {
      setIsSubmitting(true)
      const result = await actions.create({
        name: name.trim(),
        summary: summary.trim(),
        description: description.trim(),
        folderId,
        artStyle,
      }) as { assetId?: string }
      if (generateAfterCreate) {
        if (!result.assetId) {
          throw new Error('Missing assetId from create response')
        }
        await actions.generate({
          id: result.assetId,
          artStyle,
          count,
        })
      }
      onSuccess()
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 p-4">
      <div className="glass-surface-modal max-w-2xl w-full max-h-[85vh] flex flex-col">
        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">
              {t('prop.title')}
            </h3>
            <button
              onClick={onClose}
              className="glass-btn-base glass-btn-soft w-8 h-8 rounded-full flex items-center justify-center text-[var(--glass-text-tertiary)]"
            >
              <AppIcon name="close" className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label className="glass-field-label block">
                {t('prop.name')} <span className="text-[var(--glass-tone-danger-fg)]">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('prop.namePlaceholder')}
                className="glass-input-base w-full px-3 py-2 text-sm"
              />
            </div>

            {mode === 'project' && (
              <div className="space-y-2">
                <label className="glass-field-label block">创建方式</label>
                <SegmentedControl
                  value={createSource}
                  onChange={(value) => setCreateSource(value as 'manual' | 'from-hub')}
                  options={[
                    { value: 'manual', label: '手动创建' },
                    { value: 'from-hub', label: '从资产中心导入' },
                  ]}
                />
              </div>
            )}

            {createSource === 'from-hub' && mode === 'project' ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setHubPickerOpen(true)}
                  disabled={!name.trim() || isSubmitting}
                  className="w-full rounded-lg border border-dashed border-[var(--glass-stroke-base)] p-4 text-left transition hover:border-[var(--glass-tone-info-stroke)] hover:bg-[var(--glass-tone-info-bg)]/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selectedHubAssetId ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-[var(--glass-text-primary)]">{selectedHubAssetName}</p>
                        <p className="text-xs text-[var(--glass-text-tertiary)] mt-0.5">已选择资产中心物品，点击重新选择</p>
                      </div>
                      <AppIcon name="check" className="w-5 h-5 text-[var(--glass-tone-success-fg)]" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[var(--glass-bg-muted)] flex items-center justify-center">
                        <AppIcon name="image" className="w-5 h-5 text-[var(--glass-text-tertiary)]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--glass-text-primary)]">选择资产中心物品</p>
                        <p className="text-xs text-[var(--glass-text-tertiary)] mt-0.5">导入物品描述与图片，使用你输入的名称</p>
                      </div>
                      <AppIcon name="chevronRight" className="w-4 h-4 text-[var(--glass-text-tertiary)] ml-auto" />
                    </div>
                  )}
                </button>
                {!name.trim() && (
                  <p className="text-xs text-[var(--glass-text-tertiary)]">请先输入物品名称</p>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="glass-field-label block">
                    {t('prop.summary')} <span className="text-[var(--glass-tone-danger-fg)]">*</span>
                  </label>
                  <textarea
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    placeholder={t('prop.summaryPlaceholder')}
                    className="glass-textarea-base w-full h-36 px-3 py-2 text-sm resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="glass-field-label block">
                    {t('prop.description')} <span className="text-[var(--glass-tone-danger-fg)]">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={t('prop.descriptionPlaceholder')}
                    className="glass-textarea-base w-full h-36 px-3 py-2 text-sm resize-none"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <GlobalAssetPicker
          isOpen={hubPickerOpen}
          onClose={() => setHubPickerOpen(false)}
          onSelect={(assetId, assetName) => {
            setSelectedHubAssetId(assetId)
            setSelectedHubAssetName(assetName || '')
            setHubPickerOpen(false)
          }}
          type="prop"
          scope="global"
          title="从资产中心选择物品"
          confirmText="选择"
        />

        <div className="flex gap-3 justify-end p-4 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] rounded-b-xl flex-shrink-0">
          <button
            onClick={onClose}
            className="glass-btn-base glass-btn-secondary px-4 py-2 rounded-lg text-sm"
            disabled={isSubmitting}
          >
            {t('common.cancel')}
          </button>
          {createSource === 'from-hub' && mode === 'project' ? (
            <button
              onClick={() => void handleSubmit(false)}
              disabled={isSubmitting || !name.trim() || !selectedHubAssetId}
              className="glass-btn-base glass-btn-primary px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
            >
              {isSubmitting ? (
                <TaskStatusInline state={submittingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
              ) : (
                <span>添加道具</span>
              )}
            </button>
          ) : (
            <>
          <button
            onClick={() => void handleSubmit(false)}
            disabled={isSubmitting || !name.trim() || !summary.trim() || !description.trim()}
            className="glass-btn-base glass-btn-secondary px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
          >
            {isSubmitting ? (
              <TaskStatusInline state={submittingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
            ) : (
              <span>{mode === 'asset-hub' ? t('common.addOnlyToAssetHubProp') : t('common.addOnlyProp')}</span>
            )}
          </button>
          <ImageGenerationInlineCountButton
            prefix={<span>{t('common.addAndGeneratePrefix')}</span>}
            suffix={<span>{t('common.generateCountSuffix')}</span>}
            value={count}
            options={getImageGenerationCountOptions('location')}
            onValueChange={setCount}
            onClick={() => void handleSubmit(true)}
            actionDisabled={!name.trim() || !summary.trim() || !description.trim()}
            selectDisabled={isSubmitting}
            ariaLabel={t('common.selectGenerateCount')}
            className="glass-btn-base glass-btn-primary flex items-center justify-center gap-1 rounded-lg px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            selectClassName="appearance-none bg-transparent border-0 pl-0 pr-3 text-sm font-semibold text-current outline-none cursor-pointer leading-none transition-colors"
          />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
