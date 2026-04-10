'use client'
import { logInfo as _ulogInfo } from '@/lib/logging/core'
import { useTranslations } from 'next-intl'
import { useRef } from 'react'
import { AppIcon } from '@/components/ui/icons'
import ImageGenerationInlineCountButton from '@/components/image-generation/ImageGenerationInlineCountButton'
import { getImageGenerationCountOptions } from '@/lib/image-generation/count'
import { useImageGenerationCount } from '@/lib/image-generation/use-image-generation-count'
import { AI_EDIT_BUTTON_CLASS, AI_EDIT_ICON_CLASS } from '@/components/ui/ai-edit-style'
import AISparklesIcon from '@/components/ui/icons/AISparklesIcon'

interface ImageSectionActionButtonsProps {
  panelId: string
  imageUrl: string | null
  previousImageUrl?: string | null
  canDownload: boolean
  isSubmittingPanelImageTask: boolean
  isModifying: boolean
  onRegeneratePanelImage: (panelId: string, count?: number, force?: boolean) => void
  onOpenEditModal: () => void
  onOpenAIDataModal: () => void
  onDownloadImage?: () => void
  onReplaceImage?: (file: File) => Promise<void>
  onRestoreImage?: () => Promise<void>
  triggerPulse: () => void
}

export default function ImageSectionActionButtons({
  panelId,
  imageUrl,
  previousImageUrl,
  canDownload,
  isSubmittingPanelImageTask,
  isModifying,
  onRegeneratePanelImage,
  onOpenEditModal,
  onOpenAIDataModal,
  onDownloadImage,
  onReplaceImage,
  onRestoreImage,
  triggerPulse,
}: ImageSectionActionButtonsProps) {
  const t = useTranslations('storyboard')
  const { count, setCount } = useImageGenerationCount('storyboard-candidates')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.currentTarget.value = ''
          if (!file || !onReplaceImage) return
          void onReplaceImage(file)
        }}
      />
      <div className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 z-20 transition-opacity ${isSubmittingPanelImageTask ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <div className="relative glass-surface-modal border border-[var(--glass-stroke-base)] rounded-lg p-0.5">
          <div className="flex items-center gap-0.5">
            {canDownload && onDownloadImage && (
              <>
                <button
                  onClick={onDownloadImage}
                  className="glass-btn-base glass-btn-secondary flex h-6 w-6 items-center justify-center rounded-full transition-all active:scale-95"
                  title={t('image.downloadCurrent')}
                >
                  <AppIcon name="download" className="w-3 h-3" />
                </button>
                <div className="w-px h-3 bg-[var(--glass-stroke-base)]" />
              </>
            )}

            {onReplaceImage && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSubmittingPanelImageTask || isModifying}
                  className="glass-btn-base glass-btn-secondary flex h-6 w-6 items-center justify-center rounded-full transition-all active:scale-95 disabled:opacity-50"
                  title={t('image.uploadReplace')}
                >
                  <AppIcon name="upload" className="w-3 h-3" />
                </button>
                <div className="w-px h-3 bg-[var(--glass-stroke-base)]" />
              </>
            )}

            <ImageGenerationInlineCountButton
              prefix={
                <>
                  <AppIcon name="refresh" className="w-2.5 h-2.5" />
                  <span>{isSubmittingPanelImageTask ? t('image.forceRegenerate') : t('panel.regenerate')}</span>
                </>
              }
              suffix={<span>{t('image.generateCountSuffix')}</span>}
              value={count}
              options={getImageGenerationCountOptions('storyboard-candidates')}
              onValueChange={setCount}
              onClick={() => {
                _ulogInfo('[ImageSection] 🔄 左下角重新生成按钮被点击')
                _ulogInfo('[ImageSection] isSubmittingPanelImageTask:', isSubmittingPanelImageTask)
                _ulogInfo('[ImageSection] 将传递 force:', isSubmittingPanelImageTask)
                triggerPulse()
                onRegeneratePanelImage(panelId, count, isSubmittingPanelImageTask)
              }}
              disabled={false}
              ariaLabel={t('image.selectCount')}
              className={`glass-btn-base glass-btn-secondary flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 ${isSubmittingPanelImageTask ? 'opacity-75' : ''}`}
              selectClassName="appearance-none bg-transparent border-0 pl-0 pr-3 text-[10px] font-semibold text-[var(--glass-text-primary)] outline-none cursor-pointer leading-none transition-colors"
              labelClassName="inline-flex items-center gap-0.5"
            />

            <div className="w-px h-3 bg-[var(--glass-stroke-base)]" />

            <button
              onClick={onOpenAIDataModal}
              className={`glass-btn-base glass-btn-secondary flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 ${isSubmittingPanelImageTask || isModifying ? 'opacity-75' : ''}`}
              title={t('aiData.viewData')}
            >
              <AppIcon name="chart" className="w-2.5 h-2.5" />
              <span>{t('aiData.viewData')}</span>
            </button>
            {imageUrl && (
              <button
                onClick={onOpenEditModal}
                className={`glass-btn-base h-6 w-6 rounded-full flex items-center justify-center transition-all active:scale-95 ${AI_EDIT_BUTTON_CLASS} ${isSubmittingPanelImageTask || isModifying ? 'opacity-75' : ''}`}
                title={t('image.editImage')}
              >
                <AISparklesIcon className={`w-2.5 h-2.5 ${AI_EDIT_ICON_CLASS}`} />
              </button>
            )}

            {previousImageUrl && onRestoreImage && (
              <>
                <div className="w-px h-3 bg-[var(--glass-stroke-base)]" />
                <button
                  onClick={() => void onRestoreImage()}
                  disabled={isSubmittingPanelImageTask || isModifying}
                  className="glass-btn-base glass-btn-secondary flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] transition-all active:scale-95 disabled:opacity-50"
                  title={t('image.restorePrevious')}
                >
                  <span>{t('image.restorePrevious')}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
