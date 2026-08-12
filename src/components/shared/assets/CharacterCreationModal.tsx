'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, MouseEvent } from 'react'
import { useTranslations } from 'next-intl'
import { useProjectAssets, useCopyProjectAssetFromGlobal, useCreateProjectCharacter } from '@/lib/query/hooks'
import CharacterCreationForm from './character-creation/CharacterCreationForm'
import { useCharacterCreationSubmit } from './character-creation/hooks/useCharacterCreationSubmit'
import { AppIcon } from '@/components/ui/icons'
import GlobalAssetPicker from '@/components/shared/assets/GlobalAssetPicker'
import { shouldShowError } from '@/lib/error-utils'
import ImageGenerationInlineCountButton from '@/components/image-generation/ImageGenerationInlineCountButton'
import { getImageGenerationCountOptions } from '@/lib/image-generation/count'

export interface CharacterCreationModalProps {
  mode: 'asset-hub' | 'project'
  folderId?: string | null
  projectId?: string
  onClose: () => void
  onSuccess: () => void
}

const XMarkIcon = ({ className }: { className?: string }) => (
  <AppIcon name="close" className={className} />
)

export function CharacterCreationModal({
  mode,
  folderId,
  projectId,
  onClose,
  onSuccess,
}: CharacterCreationModalProps) {
  const t = useTranslations('assetModal')

  const [createMode, setCreateMode] = useState<'reference' | 'description'>('description')
  const [createSource, setCreateSource] = useState<'manual' | 'from-hub'>('manual')
  const [selectedHubAssetId, setSelectedHubAssetId] = useState<string | null>(null)
  const [selectedHubAssetName, setSelectedHubAssetName] = useState<string>('')
  const [hubPickerOpen, setHubPickerOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [aiInstruction, setAiInstruction] = useState('')
  const [artStyle, setArtStyle] = useState('american-comic')
  const [referenceImagesBase64, setReferenceImagesBase64] = useState<string[]>([])
  const [referenceSubMode, setReferenceSubMode] = useState<'direct' | 'extract'>('direct')
  const [isSubAppearance, setIsSubAppearance] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState('')
  const [changeReason, setChangeReason] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const projectAssets = useProjectAssets(mode === 'project' ? (projectId ?? null) : null)
  const availableCharacters = useMemo(() => {
    if (mode !== 'project') return []
    const items = projectAssets.data?.characters || []
    return items.map((c) => ({
      id: c.id,
      name: c.name,
      appearances: c.appearances || [],
    }))
  }, [mode, projectAssets.data?.characters])

  const copyFromGlobal = useCopyProjectAssetFromGlobal(projectId ?? '')
  const createProjectCharacterHook = useCreateProjectCharacter(projectId ?? '')

  const {
    isSubmitting,
    isAiDesigning,
    isExtracting,
    characterGenerationCount,
    setCharacterGenerationCount,
    referenceCharacterGenerationCount,
    setReferenceCharacterGenerationCount,
    handleExtractDescription,
    handleCreateWithReference,
    handleUploadTriptych,
    handleAiDesign,
    handleSubmit,
    handleSubmitAndGenerate,
  } = useCharacterCreationSubmit({
    mode,
    folderId,
    projectId,
    name,
    description,
    aiInstruction,
    artStyle,
    referenceImagesBase64,
    referenceSubMode,
    isSubAppearance,
    selectedCharacterId,
    changeReason,
    setDescription,
    setAiInstruction,
    onSuccess,
    onClose,
  })

  const handleFileSelect = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (fileArray.length === 0) return

    const remaining = 5 - referenceImagesBase64.length
    const toAdd = fileArray.slice(0, remaining)

    for (const file of toAdd) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = e.target?.result as string
        setReferenceImagesBase64((prev) => {
          if (prev.length >= 5) return prev
          if (prev.includes(base64)) return prev
          return [...prev, base64]
        })
      }
      reader.readAsDataURL(file)
    }
  }, [referenceImagesBase64.length])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && !isAiDesigning) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isAiDesigning, isSubmitting, onClose])

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (createMode !== 'reference') return

      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        if (!items[i].type.startsWith('image/')) continue
        const file = items[i].getAsFile()
        if (!file) continue
        e.preventDefault()
        void handleFileSelect([file])
        break
      }
    }

    document.addEventListener('paste', handleGlobalPaste)
    return () => document.removeEventListener('paste', handleGlobalPaste)
  }, [createMode, handleFileSelect])

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.files.length > 0) {
      void handleFileSelect(e.dataTransfer.files)
    }
  }

  const handleClearReference = (index?: number) => {
    if (typeof index === 'number') {
      setReferenceImagesBase64((prev) => prev.filter((_, i) => i !== index))
      return
    }
    setReferenceImagesBase64([])
  }

  // Create from asset hub: create project character with user's name, then copy from global
  const [isCreatingFromHub, setIsCreatingFromHub] = useState(false)
  const handleCreateFromHub = async () => {
    if (!name.trim() || !selectedHubAssetId || !projectId) return
    try {
      setIsCreatingFromHub(true)
      // Create a basic character with the user's name
      const result = await createProjectCharacterHook.mutateAsync({
        name: name.trim(),
        description: `${name.trim()} 的角色设定`,
      }) as { character?: { id: string; appearances?: Array<{ id: string }> } }
      const characterId = result.character?.id
      if (!characterId) {
        throw new Error(t('errors.createFailed'))
      }
      // Copy from global asset (this brings over appearances, images, description, voice)
      await copyFromGlobal.mutateAsync({
        type: 'character',
        targetId: characterId,
        globalAssetId: selectedHubAssetId,
      })
      onSuccess()
      onClose()
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        const err = error as Error
        alert(err.message || t('errors.createFailed'))
      }
    } finally {
      setIsCreatingFromHub(false)
    }
  }

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !isSubmitting && !isAiDesigning) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 glass-overlay flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="glass-surface-modal max-w-lg w-full max-h-[85vh] flex flex-col">
        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">
              {t('character.title')}
            </h3>
            <button
              onClick={onClose}
              className="glass-btn-base glass-btn-soft w-8 h-8 rounded-full flex items-center justify-center text-[var(--glass-text-tertiary)]"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {mode === 'project' && (
            <div className="mb-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCreateSource('manual')}
                  className={`flex-1 py-2 text-sm rounded-lg transition ${
                    createSource === 'manual'
                      ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] font-medium'
                      : 'text-[var(--glass-text-tertiary)] hover:bg-[var(--glass-bg-muted)]'
                  }`}
                >
                  手动创建
                </button>
                <button
                  type="button"
                  onClick={() => setCreateSource('from-hub')}
                  className={`flex-1 py-2 text-sm rounded-lg transition ${
                    createSource === 'from-hub'
                      ? 'bg-[var(--glass-tone-info-bg)] text-[var(--glass-tone-info-fg)] font-medium'
                      : 'text-[var(--glass-text-tertiary)] hover:bg-[var(--glass-bg-muted)]'
                  }`}
                >
                  从资产中心导入
                </button>
              </div>
            </div>
          )}

          {createSource === 'from-hub' && mode === 'project' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="glass-field-label block">
                  {t('character.name')} <span className="text-[var(--glass-tone-danger-fg)]">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('character.namePlaceholder')}
                  className="glass-input-base w-full px-3 py-2 text-sm"
                />
              </div>

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
                      <p className="text-xs text-[var(--glass-text-tertiary)] mt-0.5">已选择资产中心角色，点击重新选择</p>
                    </div>
                    <AppIcon name="check" className="w-5 h-5 text-[var(--glass-tone-success-fg)]" />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--glass-bg-muted)] flex items-center justify-center">
                      <AppIcon name="userAlt" className="w-5 h-5 text-[var(--glass-text-tertiary)]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--glass-text-primary)]">选择资产中心角色</p>
                      <p className="text-xs text-[var(--glass-text-tertiary)] mt-0.5">导入角色形象、描述和图片，使用你输入的名称</p>
                    </div>
                    <AppIcon name="chevronRight" className="w-4 h-4 text-[var(--glass-text-tertiary)] ml-auto" />
                  </div>
                )}
              </button>
              {!name.trim() && (
                <p className="text-xs text-[var(--glass-text-tertiary)]">请先输入角色名称</p>
              )}
            </div>
          ) : (
            <CharacterCreationForm
            mode={mode}
            createMode={createMode}
            setCreateMode={(value) => setCreateMode(value)}
            name={name}
            setName={(value) => setName(value)}
            description={description}
            setDescription={(value) => setDescription(value)}
            aiInstruction={aiInstruction}
            setAiInstruction={(value) => setAiInstruction(value)}
            artStyle={artStyle}
            setArtStyle={(value) => setArtStyle(value)}
            referenceImagesBase64={referenceImagesBase64}
            referenceSubMode={referenceSubMode}
            setReferenceSubMode={(value) => setReferenceSubMode(value)}
            isSubAppearance={isSubAppearance}
            setIsSubAppearance={(value) => setIsSubAppearance(value)}
            selectedCharacterId={selectedCharacterId}
            setSelectedCharacterId={(value) => setSelectedCharacterId(value)}
            changeReason={changeReason}
            setChangeReason={(value) => setChangeReason(value)}
            availableCharacters={availableCharacters}
            fileInputRef={fileInputRef}
            handleDrop={handleDrop}
            handleFileSelect={(files) => void handleFileSelect(files)}
            handleClearReference={handleClearReference}
            handleExtractDescription={() => { void handleExtractDescription() }}
            handleAiDesign={() => { void handleAiDesign() }}
            isSubmitting={isSubmitting}
            isAiDesigning={isAiDesigning}
            isExtracting={isExtracting}
            />
          )}
        </div>

        <GlobalAssetPicker
          isOpen={hubPickerOpen}
          onClose={() => setHubPickerOpen(false)}
          onSelect={(assetId, assetName) => {
            setSelectedHubAssetId(assetId)
            setSelectedHubAssetName(assetName || '')
            setHubPickerOpen(false)
          }}
          type="character"
          scope="global"
          title="从资产中心选择角色"
          confirmText="选择"
        />

        <div className="flex items-center justify-end gap-2 p-4 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] rounded-b-xl flex-shrink-0">
          <button
            onClick={onClose}
            className="glass-btn-base glass-btn-secondary px-4 py-2 rounded-lg text-sm"
            disabled={isSubmitting}
          >
            {t('common.cancel')}
          </button>
          {createSource === 'from-hub' && mode === 'project' ? (
            <button
              onClick={() => { void handleCreateFromHub() }}
              disabled={isSubmitting || !name.trim() || !selectedHubAssetId}
              className="glass-btn-base glass-btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isCreatingFromHub ? t('common.adding') : '添加角色'}
            </button>
          ) : createMode === 'reference' ? (
            <>
              <button
                onClick={() => { void handleUploadTriptych() }}
                disabled={isSubmitting || !name.trim() || referenceImagesBase64.length === 0}
                className="glass-btn-base glass-btn-secondary px-4 py-2 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t('character.directUploadTriptych')}
              </button>
              <ImageGenerationInlineCountButton
                prefix={<span>{t('character.useReferenceGeneratePrefix')}</span>}
                suffix={<span>{t('character.generateCountSuffix')}</span>}
                value={referenceCharacterGenerationCount}
                options={getImageGenerationCountOptions('reference-to-character')}
                onValueChange={setReferenceCharacterGenerationCount}
                onClick={() => { void handleCreateWithReference() }}
                actionDisabled={!name.trim() || referenceImagesBase64.length === 0}
                selectDisabled={isSubmitting}
                ariaLabel={t('character.selectReferenceGenerateCount')}
                className="glass-btn-base glass-btn-primary flex items-center justify-center gap-1 rounded-lg px-4 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                selectClassName="appearance-none bg-transparent border-0 pl-0 pr-3 text-sm font-semibold text-current outline-none cursor-pointer leading-none transition-colors"
              />
            </>
          ) : isSubAppearance ? (
            <button
              onClick={() => { void handleSubmit() }}
              disabled={isSubmitting || !selectedCharacterId.trim() || !changeReason.trim() || !description.trim()}
              className="glass-btn-base glass-btn-primary px-4 py-2 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? t('common.adding') : t('common.add')}
            </button>
          ) : (
            <>
              <button
                onClick={() => { void handleSubmit() }}
                disabled={isSubmitting || !name.trim() || !description.trim()}
                className="glass-btn-base glass-btn-secondary px-4 py-2 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? t('common.adding') : (mode === 'asset-hub' ? t('common.addOnlyToAssetHub') : t('common.addOnly'))}
              </button>
              <ImageGenerationInlineCountButton
                prefix={<span>{t('common.addAndGeneratePrefix')}</span>}
                suffix={<span>{t('common.generateCountSuffix')}</span>}
                value={characterGenerationCount}
                options={getImageGenerationCountOptions('character')}
                onValueChange={setCharacterGenerationCount}
                onClick={() => { void handleSubmitAndGenerate() }}
                actionDisabled={!name.trim() || !description.trim()}
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
