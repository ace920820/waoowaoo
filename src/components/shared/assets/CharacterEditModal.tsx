'use client'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { shouldShowError } from '@/lib/error-utils'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { ART_STYLES } from '@/lib/constants'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import {
    useAiModifyCharacterDescription,
    useGenerateCharacterImageFromReference,
    useUploadCharacterImage,
    useUploadAssetHubTempMedia,
    useAiModifyProjectAppearanceDescription,
    useUpdateCharacterAppearanceDescription,
    useUpdateCharacterName,
    useUpdateProjectAppearanceDescription,
    useUpdateProjectCharacterIntroduction,
    useUpdateProjectCharacterName,
} from '@/lib/query/hooks'
import { useImageGenerationCount } from '@/lib/image-generation/use-image-generation-count'
import { AiModifyDescriptionField } from './AiModifyDescriptionField'

export interface CharacterEditModalProps {
    mode: 'asset-hub' | 'project'
    characterId: string
    characterName: string
    description: string
    appearanceIndex?: number
    changeReason?: string
    artStyle?: string | null
    projectId?: string
    appearanceId?: string
    descriptionIndex?: number
    isTaskRunning?: boolean
    introduction?: string | null
    onClose: () => void
    onSave: (
        characterId: string,
        appearanceId: string,
        options?: { artStyle?: string | null; appearanceIndex?: number },
    ) => void
    onUpdate?: (newDescription: string) => void
    onIntroductionUpdate?: (newIntroduction: string) => void
    onNameUpdate?: (newName: string) => void
    onRefresh?: () => void
}

export function CharacterEditModal({
    mode,
    characterId,
    characterName,
    description,
    appearanceIndex,
    changeReason,
    artStyle,
    projectId,
    appearanceId,
    descriptionIndex,
    isTaskRunning = false,
    introduction,
    onClose,
    onSave,
    onUpdate,
    onIntroductionUpdate,
    onNameUpdate,
    onRefresh,
}: CharacterEditModalProps) {
    const t = useTranslations('assets')

    const appearanceKey = mode === 'asset-hub'
        ? String(appearanceIndex ?? 0)
        : String(appearanceId ?? '')

    const [editingName, setEditingName] = useState(characterName)
    const [editingDescription, setEditingDescription] = useState(description)
    const [editingIntroduction, setEditingIntroduction] = useState(introduction || '')
    const [editingArtStyle, setEditingArtStyle] = useState(artStyle || 'american-comic')
    const [aiModifyInstruction, setAiModifyInstruction] = useState('')
    const [isAiModifying, setIsAiModifying] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const aiModifyingState = isAiModifying
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'modify',
            resource: 'image',
            hasOutput: true,
        })
        : null
    const savingState = isSaving
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'process',
            resource: 'text',
            hasOutput: false,
        })
        : null
    const taskRunningState = isTaskRunning
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'modify',
            resource: 'image',
            hasOutput: true,
        })
        : null

    const updateAssetHubName = useUpdateCharacterName()
    const updateProjectName = useUpdateProjectCharacterName(projectId ?? '')
    const updateAssetHubAppearanceDesc = useUpdateCharacterAppearanceDescription()
    const updateProjectAppearanceDesc = useUpdateProjectAppearanceDescription(projectId ?? '')
    const updateProjectIntroduction = useUpdateProjectCharacterIntroduction(projectId ?? '')
    const aiModifyAssetHub = useAiModifyCharacterDescription()
    const aiModifyProject = useAiModifyProjectAppearanceDescription(projectId ?? '')
    const uploadAssetHubTempMedia = useUploadAssetHubTempMedia()
    const generateAssetHubCharacterImageFromReference = useGenerateCharacterImageFromReference()
    const uploadAssetHubCharacterImage = useUploadCharacterImage()
    const {
        count: referenceCharacterGenerationCount,
        setCount: setReferenceCharacterGenerationCount,
    } = useImageGenerationCount('reference-to-character')
    const [referenceImagesBase64, setReferenceImagesBase64] = useState<string[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const getErrorMessage = (error: unknown, fallback: string) => {
        if (error instanceof Error && error.message) return error.message
        return fallback
    }

    const base64ToFile = (base64: string, filename: string) => {
        const [header, body] = base64.split(',')
        if (!header || !body) {
            throw new Error('Invalid base64 image')
        }
        const mimeMatch = header.match(/data:(.*?);base64/)
        const mime = mimeMatch?.[1] || 'image/png'
        const binary = atob(body)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index)
        }
        const extension = mime.split('/')[1] || 'png'
        return new File([bytes], `${filename}.${extension}`, { type: mime })
    }

    const handleFileSelect = useCallback(async (files: FileList | File[]) => {
        const fileArray = Array.from(files).filter((file) => file.type.startsWith('image/'))
        if (fileArray.length === 0) return

        const remaining = 5 - referenceImagesBase64.length
        const toAdd = fileArray.slice(0, remaining)
        for (const file of toAdd) {
            const reader = new FileReader()
            reader.onload = (event) => {
                const base64 = event.target?.result as string
                setReferenceImagesBase64((previous) => {
                    if (!base64 || previous.includes(base64) || previous.length >= 5) return previous
                    return [...previous, base64]
                })
            }
            reader.readAsDataURL(file)
        }
    }, [referenceImagesBase64.length])

    const handleClearReference = (index?: number) => {
        if (typeof index === 'number') {
            setReferenceImagesBase64((previous) => previous.filter((_value, currentIndex) => currentIndex !== index))
            return
        }
        setReferenceImagesBase64([])
    }

    const uploadReferenceImages = useCallback(async () => {
        return await Promise.all(referenceImagesBase64.map(async (imageBase64) => {
            const data = await uploadAssetHubTempMedia.mutateAsync({ imageBase64 })
            if (!data.url) {
                throw new Error(t('image.uploadFailed'))
            }
            return data.url
        }))
    }, [referenceImagesBase64, t, uploadAssetHubTempMedia])

    const persistNameIfNeeded = async () => {
        const nextName = editingName.trim()
        if (!nextName || nextName === characterName) return

        if (mode === 'asset-hub') {
            await updateAssetHubName.mutateAsync({ characterId, name: nextName })
        } else {
            await updateProjectName.mutateAsync({ characterId, name: nextName })
        }
        onNameUpdate?.(nextName)
    }

    const persistDescription = async () => {
        if (mode === 'asset-hub') {
            await updateAssetHubAppearanceDesc.mutateAsync({
                characterId,
                appearanceIndex: appearanceIndex ?? 0,
                description: editingDescription,
                artStyle: editingArtStyle,
            })
            return
        }

        if (!appearanceId) {
            throw new Error('Missing appearanceId')
        }
        await updateProjectAppearanceDesc.mutateAsync({
            characterId,
            appearanceId,
            description: editingDescription,
            descriptionIndex,
        })
    }

    const persistIntroductionIfNeeded = async () => {
        if (mode !== 'project' || !projectId) return
        if (editingIntroduction === (introduction || '')) return

        const nextIntro = editingIntroduction.trim()
        await updateProjectIntroduction.mutateAsync({
            characterId,
            introduction: nextIntro,
        })
        onIntroductionUpdate?.(nextIntro)
    }

    const handleAiModify = async () => {
        if (!aiModifyInstruction.trim()) return false

        try {
            setIsAiModifying(true)

            if (mode === 'asset-hub') {
                const data = await aiModifyAssetHub.mutateAsync({
                    characterId,
                    appearanceIndex: appearanceIndex ?? 0,
                    currentDescription: editingDescription,
                    modifyInstruction: aiModifyInstruction,
                })
                if (data?.modifiedDescription) {
                    setEditingDescription(data.modifiedDescription)
                    onUpdate?.(data.modifiedDescription)
                    setAiModifyInstruction('')
                    return true
                }
                return false
            }

            if (!appearanceId) throw new Error('Missing appearanceId')
            const data = await aiModifyProject.mutateAsync({
                characterId,
                appearanceId,
                currentDescription: editingDescription,
                modifyInstruction: aiModifyInstruction,
            })
            if (data?.modifiedDescription) {
                setEditingDescription(data.modifiedDescription)
                onUpdate?.(data.modifiedDescription)
                setAiModifyInstruction('')
                return true
            }
            return false
        } catch (error: unknown) {
            if (shouldShowError(error)) {
                alert(`${t('modal.modifyFailed')}: ${getErrorMessage(error, t('errors.failed'))}`)
            }
            return false
        } finally {
            setIsAiModifying(false)
        }
    }

    const handleSaveName = async () => {
        try {
            await persistNameIfNeeded()
            onRefresh?.()
        } catch (error: unknown) {
            if (shouldShowError(error)) {
                alert(t('modal.saveName') + t('errors.failed'))
            }
        }
    }

    const handleSaveOnly = async () => {
        try {
            setIsSaving(true)
            await persistNameIfNeeded()
            await persistDescription()
            await persistIntroductionIfNeeded()

            onUpdate?.(editingDescription)
            onRefresh?.()
            onClose()
        } catch (error: unknown) {
            if (shouldShowError(error)) {
                alert(getErrorMessage(error, t('errors.saveFailed')))
            }
        } finally {
            setIsSaving(false)
        }
    }

    const handleSaveAndGenerate = async () => {
        const savedDescription = editingDescription
        const savedAppearanceKey = appearanceKey
        const shouldGenerateFromReference = mode === 'asset-hub' && referenceImagesBase64.length > 0
        onClose()

        ; (async () => {
            try {
                await persistNameIfNeeded()
                await persistDescription()
                await persistIntroductionIfNeeded()

                onUpdate?.(savedDescription)
                onRefresh?.()
                if (shouldGenerateFromReference && appearanceId) {
                    const referenceImageUrls = await uploadReferenceImages()
                    await generateAssetHubCharacterImageFromReference.mutateAsync({
                        characterId,
                        appearanceId,
                        appearanceIndex: appearanceIndex ?? 0,
                        characterName: editingName.trim() || characterName,
                        artStyle: editingArtStyle,
                        customDescription: savedDescription.trim() || undefined,
                        referenceImageUrls,
                        count: referenceCharacterGenerationCount,
                    })
                    return
                }
                onSave(characterId, savedAppearanceKey, {
                    artStyle: editingArtStyle,
                    appearanceIndex: appearanceIndex ?? 0,
                })
            } catch (error: unknown) {
                if (shouldShowError(error)) {
                    alert(getErrorMessage(error, t('errors.saveFailed')))
                }
            }
        })()
    }

    const handleSaveAndUploadTriptych = async () => {
        if (mode !== 'asset-hub' || referenceImagesBase64.length === 0) return

        const savedDescription = editingDescription
        const uploadSource = referenceImagesBase64[0]
        onClose()

        ; (async () => {
            try {
                await persistNameIfNeeded()
                await persistDescription()
                await persistIntroductionIfNeeded()

                onUpdate?.(savedDescription)
                onRefresh?.()
                await uploadAssetHubCharacterImage.mutateAsync({
                    file: base64ToFile(uploadSource, `${editingName.trim() || characterName}-triptych`),
                    characterId,
                    appearanceIndex: appearanceIndex ?? 0,
                    labelText: `${editingName.trim() || characterName} 三视图`,
                })
            } catch (error: unknown) {
                if (shouldShowError(error)) {
                    alert(getErrorMessage(error, t('errors.saveFailed')))
                }
            }
        })()
    }

    const showReferenceGeneration = mode === 'asset-hub'
    const canSaveAndGenerate = isSaving
        || isTaskRunning
        || (!editingDescription.trim() && referenceImagesBase64.length === 0)

    return (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 p-4">
            <div className="glass-surface-modal max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">
                            {t('modal.editCharacter')} - {characterName}
                        </h3>
                        <button
                            onClick={onClose}
                            className="glass-btn-base glass-btn-soft w-9 h-9 rounded-full text-[var(--glass-text-tertiary)]"
                        >
                            <AppIcon name="close" className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="space-y-2">
                        <label className="glass-field-label block">
                            {t('character.name')}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="glass-input-base flex-1 px-3 py-2"
                                placeholder={t('modal.namePlaceholder')}
                            />
                            {editingName !== characterName && (
                                <button
                                    onClick={handleSaveName}
                                    disabled={updateAssetHubName.isPending || updateProjectName.isPending || !editingName.trim()}
                                    className="glass-btn-base glass-btn-tone-success px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
                                >
                                    {(updateAssetHubName.isPending || updateProjectName.isPending)
                                        ? t('smartImport.preview.saving')
                                        : t('modal.saveName')}
                                </button>
                            )}
                        </div>
                    </div>

                    {mode === 'project' && (
                        <div className="space-y-2">
                            <label className="glass-field-label block">
                                {t('modal.introduction')}
                            </label>
                            <textarea
                                value={editingIntroduction}
                                onChange={(e) => setEditingIntroduction(e.target.value)}
                                rows={3}
                                className="glass-textarea-base w-full px-3 py-2 resize-none"
                                placeholder={t('modal.introductionPlaceholder')}
                            />
                            <p className="glass-field-hint">
                                {t('modal.introductionTip')}
                            </p>
                        </div>
                    )}

                    {mode === 'asset-hub' && changeReason && (
                        <div className="text-sm text-[var(--glass-text-secondary)]">
                            {t('character.appearance')}:
                            <span className="ml-1 inline-flex items-center rounded-full px-2 py-0.5 bg-[var(--glass-tone-neutral-bg)] text-[var(--glass-tone-neutral-fg)]">
                                {changeReason}
                            </span>
                        </div>
                    )}

                    {mode === 'asset-hub' && (
                        <div className="space-y-2">
                            <label className="glass-field-label block">
                                {t('modal.artStyle')}
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {ART_STYLES.map((style) => (
                                    <button
                                        key={style.value}
                                        type="button"
                                        onClick={() => setEditingArtStyle(style.value)}
                                        className={`glass-btn-base px-3 py-2 rounded-lg text-sm border transition-all text-left ${editingArtStyle === style.value
                                            ? 'glass-btn-primary border-[var(--glass-accent-primary)]'
                                            : 'glass-btn-secondary'
                                            }`}
                                    >
                                        {style.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {showReferenceGeneration && (
                        <div className="space-y-3 glass-surface-soft rounded-xl p-4 border border-[var(--glass-stroke-base)]">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <label className="glass-field-label block">
                                        {t('modal.referenceImagesTitle')}
                                    </label>
                                    <p className="glass-field-hint mt-1">
                                        {t('modal.referenceImagesHint')}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-[var(--glass-text-secondary)]">
                                        {t('modal.referenceGenerateCount')}
                                    </span>
                                    <select
                                        value={referenceCharacterGenerationCount}
                                        onChange={(event) => setReferenceCharacterGenerationCount(Number(event.target.value))}
                                        className="glass-select-base px-2 py-1 text-sm"
                                    >
                                        {[1, 2, 3, 4, 5].map((count) => (
                                            <option key={count} value={count}>{count}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div
                                className="border-2 border-dashed border-[var(--glass-stroke-base)] rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:border-[var(--glass-stroke-focus)] hover:bg-[var(--glass-tone-info-bg)] transition-all relative min-h-[120px]"
                                onDrop={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    if (event.dataTransfer.files.length > 0) {
                                        void handleFileSelect(event.dataTransfer.files)
                                    }
                                }}
                                onDragOver={(event) => {
                                    event.preventDefault()
                                    event.stopPropagation()
                                }}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={(event) => {
                                        if (event.target.files) {
                                            void handleFileSelect(event.target.files)
                                        }
                                    }}
                                />

                                {referenceImagesBase64.length > 0 ? (
                                    <div className="w-full">
                                        <div className="grid grid-cols-3 gap-2 mb-2">
                                            {referenceImagesBase64.map((base64, index) => (
                                                <div key={`${index}-${base64.slice(0, 16)}`} className="relative aspect-square">
                                                    <MediaImageWithLoading
                                                        src={base64}
                                                        alt={`${t('modal.referenceImageAlt')} ${index + 1}`}
                                                        containerClassName="w-full h-full rounded"
                                                        className="w-full h-full object-cover rounded"
                                                    />
                                                    <button
                                                        onClick={(event) => {
                                                            event.stopPropagation()
                                                            handleClearReference(index)
                                                        }}
                                                        className="glass-btn-base glass-btn-tone-danger absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-xs text-center text-[var(--glass-text-secondary)]">
                                            {t('modal.referenceSelectedCount', { count: referenceImagesBase64.length })}
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        <AppIcon name="image" className="w-10 h-10 text-[var(--glass-text-tertiary)] mb-2" />
                                        <p className="text-sm text-[var(--glass-text-secondary)]">{t('modal.referenceDropOrClick')}</p>
                                        <p className="text-xs text-[var(--glass-text-tertiary)] mt-1">{t('modal.referenceMaxImages')}</p>
                                    </>
                                )}
                            </div>
                        </div>
                    )}

                    <AiModifyDescriptionField
                        label={t('modal.appearancePrompt')}
                        description={editingDescription}
                        onDescriptionChange={setEditingDescription}
                        descriptionPlaceholder={t('modal.descPlaceholder')}
                        descriptionHeightClassName="h-64"
                        aiInstruction={aiModifyInstruction}
                        onAiInstructionChange={setAiModifyInstruction}
                        aiInstructionPlaceholder={t('modal.modifyPlaceholderCharacter')}
                        onAiModify={handleAiModify}
                        isAiModifying={isAiModifying}
                        aiModifyingState={aiModifyingState}
                        actionLabel={t('modal.modifyDescription')}
                        cancelLabel={t('common.cancel')}
                    />
                </div>

                <div className="flex gap-3 justify-end p-4 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] rounded-b-lg flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="glass-btn-base glass-btn-secondary px-4 py-2 rounded-lg"
                        disabled={isSaving}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleSaveOnly}
                        disabled={isSaving || !editingDescription.trim()}
                        className="glass-btn-base glass-btn-tone-info px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSaving ? (
                            <TaskStatusInline state={savingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                        ) : (
                            t('modal.saveOnly')
                        )}
                    </button>
                    {showReferenceGeneration && (
                        <button
                            onClick={handleSaveAndUploadTriptych}
                            disabled={isSaving || isTaskRunning || referenceImagesBase64.length === 0}
                            className="glass-btn-base glass-btn-secondary px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {t('modal.saveAndUploadTriptych')}
                        </button>
                    )}
                    <button
                        onClick={handleSaveAndGenerate}
                        disabled={canSaveAndGenerate}
                        className="glass-btn-base glass-btn-primary px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isTaskRunning ? (
                            <TaskStatusInline state={taskRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                        ) : (
                            referenceImagesBase64.length > 0 && mode === 'asset-hub'
                                ? t('modal.saveAndGenerateFromReference')
                                : t('modal.saveAndGenerate')
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
