'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { shouldShowError } from '@/lib/error-utils'
import {
  useAiCreateProjectCharacter,
  useAiDesignCharacter,
  useCreateAssetHubCharacter,
  useCreateProjectCharacter,
  useGenerateCharacterImage,
  useGenerateCharacterImageFromReference,
  useGenerateProjectCharacterImage,
  useGenerateProjectCharacterImageFromReference,
  useCreateProjectCharacterAppearance,
  useExtractAssetHubReferenceCharacterDescription,
  useExtractProjectReferenceCharacterDescription,
  useUploadCharacterImage,
  useUploadAssetHubTempMedia,
  useUploadProjectCharacterImage,
  useUploadProjectTempMedia,
} from '@/lib/query/hooks'
import { useImageGenerationCount } from '@/lib/image-generation/use-image-generation-count'

type Mode = 'asset-hub' | 'project'

interface UseCharacterCreationSubmitParams {
  mode: Mode
  folderId?: string | null
  projectId?: string
  name: string
  description: string
  aiInstruction: string
  artStyle: string
  referenceImagesBase64: string[]
  referenceSubMode: 'direct' | 'extract'
  isSubAppearance: boolean
  selectedCharacterId: string
  changeReason: string
  setDescription: (value: string) => void
  setAiInstruction: (value: string) => void
  onSuccess: () => void
  onClose: () => void
}

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

export function useCharacterCreationSubmit({
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
}: UseCharacterCreationSubmitParams) {
  const t = useTranslations('assetModal')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAiDesigning, setIsAiDesigning] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)

  const uploadAssetHubTemp = useUploadAssetHubTempMedia()
  const uploadProjectTemp = useUploadProjectTempMedia()
  const aiDesignAssetHubCharacter = useAiDesignCharacter()
  const aiCreateProjectCharacter = useAiCreateProjectCharacter(projectId ?? '')
  const extractAssetHubDescription = useExtractAssetHubReferenceCharacterDescription()
  const extractProjectDescription = useExtractProjectReferenceCharacterDescription(projectId ?? '')
  const createAssetHubCharacter = useCreateAssetHubCharacter()
  const createProjectCharacter = useCreateProjectCharacter(projectId ?? '')
  const generateAssetHubCharacterImage = useGenerateCharacterImage()
  const generateProjectCharacterImage = useGenerateProjectCharacterImage(projectId ?? '')
  const generateAssetHubCharacterImageFromReference = useGenerateCharacterImageFromReference()
  const generateProjectCharacterImageFromReference = useGenerateProjectCharacterImageFromReference(projectId ?? '')
  const uploadAssetHubCharacterImage = useUploadCharacterImage()
  const uploadProjectCharacterImage = useUploadProjectCharacterImage(projectId ?? '')
  const createProjectAppearance = useCreateProjectCharacterAppearance(projectId ?? '')
  const {
    count: characterGenerationCount,
    setCount: setCharacterGenerationCount,
  } = useImageGenerationCount('character')
  const {
    count: referenceCharacterGenerationCount,
    setCount: setReferenceCharacterGenerationCount,
  } = useImageGenerationCount('reference-to-character')

  type CreatedCharacterResponse = {
    character?: {
      id: string
      appearances?: Array<{
        id: string
        appearanceIndex: number
      }>
    }
  }

  const uploadReferenceImages = useCallback(async () => {
    const uploadMutation = mode === 'asset-hub' ? uploadAssetHubTemp : uploadProjectTemp
    return Promise.all(
      referenceImagesBase64.map(async (base64) => {
        const data = await uploadMutation.mutateAsync({ imageBase64: base64 })
        if (!data.url) throw new Error(t('errors.uploadFailed'))
        return data.url
      }),
    )
  }, [mode, referenceImagesBase64, t, uploadAssetHubTemp, uploadProjectTemp])

  const handleExtractDescription = useCallback(async () => {
    if (referenceImagesBase64.length === 0) return

    try {
      setIsExtracting(true)
      const referenceImageUrls = await uploadReferenceImages()
      const result = mode === 'asset-hub'
        ? await extractAssetHubDescription.mutateAsync(referenceImageUrls)
        : await extractProjectDescription.mutateAsync(referenceImageUrls)
      if (result?.description) {
        setDescription(result.description)
      }
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(getErrorMessage(error, t('errors.extractDescriptionFailed')))
      }
    } finally {
      setIsExtracting(false)
    }
  }, [
    extractAssetHubDescription,
    extractProjectDescription,
    mode,
    referenceImagesBase64.length,
    setDescription,
    t,
    uploadReferenceImages,
  ])

  const handleCreateWithReference = useCallback(async () => {
    if (!name.trim() || referenceImagesBase64.length === 0) return

    try {
      setIsSubmitting(true)
      const referenceImageUrls = await uploadReferenceImages()

      let finalDescription = description.trim()
      if (referenceSubMode === 'extract') {
        const result = mode === 'asset-hub'
          ? await extractAssetHubDescription.mutateAsync(referenceImageUrls)
          : await extractProjectDescription.mutateAsync(referenceImageUrls)
        finalDescription = result?.description || finalDescription
      }

      if (mode === 'asset-hub') {
        const result = await createAssetHubCharacter.mutateAsync({
          name: name.trim(),
          description: finalDescription || t('character.defaultDescription', { name: name.trim() }),
          folderId: folderId ?? null,
          artStyle,
        }) as CreatedCharacterResponse
        const createdCharacterId = result.character?.id
        const createdAppearance = result.character?.appearances?.[0]
        if (!createdCharacterId || !createdAppearance?.id) {
          throw new Error(t('errors.createFailed'))
        }
        await generateAssetHubCharacterImageFromReference.mutateAsync({
          characterId: createdCharacterId,
          appearanceId: createdAppearance.id,
          appearanceIndex: createdAppearance.appearanceIndex,
          characterName: name.trim(),
          artStyle,
          customDescription: referenceSubMode === 'extract' ? finalDescription : undefined,
          referenceImageUrls,
          count: referenceCharacterGenerationCount,
        })
      } else {
        const result = await createProjectCharacter.mutateAsync({
          name: name.trim(),
          description: finalDescription || t('character.defaultDescription', { name: name.trim() }),
        }) as CreatedCharacterResponse
        const createdCharacterId = result.character?.id
        const createdAppearanceId = result.character?.appearances?.[0]?.id
        if (!createdCharacterId || !createdAppearanceId) {
          throw new Error(t('errors.createFailed'))
        }
        await generateProjectCharacterImageFromReference.mutateAsync({
          characterId: createdCharacterId,
          appearanceId: createdAppearanceId,
          characterName: name.trim(),
          artStyle,
          customDescription: referenceSubMode === 'extract' ? finalDescription : undefined,
          referenceImageUrls,
          count: referenceCharacterGenerationCount,
        })
      }

      onSuccess()
      onClose()
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(getErrorMessage(error, t('errors.createFailed')))
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [
    artStyle,
    createAssetHubCharacter,
    createProjectCharacter,
    description,
    extractAssetHubDescription,
    extractProjectDescription,
    folderId,
    mode,
    name,
    onClose,
    onSuccess,
    generateAssetHubCharacterImageFromReference,
    generateProjectCharacterImageFromReference,
    referenceImagesBase64.length,
    referenceSubMode,
    t,
    uploadReferenceImages,
  ])

  const handleUploadTriptych = useCallback(async () => {
    if (!name.trim() || referenceImagesBase64.length === 0) return

    try {
      setIsSubmitting(true)
      const firstReferenceImage = referenceImagesBase64[0]
      const uploadFile = base64ToFile(firstReferenceImage, `${name.trim()}-triptych`)
      const finalDescription = description.trim() || t('character.defaultDescription', { name: name.trim() })

      if (mode === 'asset-hub') {
        const result = await createAssetHubCharacter.mutateAsync({
          name: name.trim(),
          description: finalDescription,
          folderId: folderId ?? null,
          artStyle,
        }) as CreatedCharacterResponse
        const createdCharacterId = result.character?.id
        const createdAppearance = result.character?.appearances?.[0]
        if (!createdCharacterId || createdAppearance?.appearanceIndex === undefined) {
          throw new Error(t('errors.createFailed'))
        }
        await uploadAssetHubCharacterImage.mutateAsync({
          file: uploadFile,
          characterId: createdCharacterId,
          appearanceIndex: createdAppearance.appearanceIndex,
          labelText: `${name.trim()} 三视图`,
        })
      } else {
        const result = await createProjectCharacter.mutateAsync({
          name: name.trim(),
          description: finalDescription,
        }) as CreatedCharacterResponse
        const createdCharacterId = result.character?.id
        const createdAppearanceId = result.character?.appearances?.[0]?.id
        if (!createdCharacterId || !createdAppearanceId) {
          throw new Error(t('errors.createFailed'))
        }
        await uploadProjectCharacterImage.mutateAsync({
          file: uploadFile,
          characterId: createdCharacterId,
          appearanceId: createdAppearanceId,
          labelText: `${name.trim()} triptych`,
        })
      }

      onSuccess()
      onClose()
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(getErrorMessage(error, t('errors.createFailed')))
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [
    artStyle,
    createAssetHubCharacter,
    createProjectCharacter,
    description,
    folderId,
    mode,
    name,
    onClose,
    onSuccess,
    referenceImagesBase64,
    t,
    uploadAssetHubCharacterImage,
    uploadProjectCharacterImage,
  ])

  const handleAiDesign = useCallback(async () => {
    if (!aiInstruction.trim()) return

    try {
      setIsAiDesigning(true)
      const result = mode === 'asset-hub'
        ? await aiDesignAssetHubCharacter.mutateAsync(aiInstruction)
        : await aiCreateProjectCharacter.mutateAsync({ userInstruction: aiInstruction })

      if (result?.prompt) {
        setDescription(result.prompt)
        setAiInstruction('')
      }
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(getErrorMessage(error, t('errors.aiDesignFailed')))
      }
    } finally {
      setIsAiDesigning(false)
    }
  }, [aiCreateProjectCharacter, aiDesignAssetHubCharacter, aiInstruction, mode, setAiInstruction, setDescription, t])

  const handleSubmit = useCallback(async () => {
    if (isSubAppearance) {
      if (!selectedCharacterId.trim() || !changeReason.trim() || !description.trim()) return
      try {
        setIsSubmitting(true)
        await createProjectAppearance.mutateAsync({
          characterId: selectedCharacterId,
          changeReason: changeReason.trim(),
          description: description.trim(),
        })
        onSuccess()
        onClose()
      } catch (error: unknown) {
        if (shouldShowError(error)) {
          alert(getErrorMessage(error, t('errors.addSubAppearanceFailed')))
        }
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    if (!name.trim() || !description.trim()) return
    try {
      setIsSubmitting(true)
      if (mode === 'asset-hub') {
        await createAssetHubCharacter.mutateAsync({
          name: name.trim(),
          description: description.trim(),
          folderId: folderId ?? null,
          artStyle,
        })
      } else {
        await createProjectCharacter.mutateAsync({
          name: name.trim(),
          description: description.trim(),
        })
      }
      onSuccess()
      onClose()
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(getErrorMessage(error, t('errors.createFailed')))
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [
    artStyle,
    changeReason,
    createAssetHubCharacter,
    createProjectAppearance,
    createProjectCharacter,
    description,
    folderId,
    isSubAppearance,
    mode,
    name,
    onClose,
    onSuccess,
    selectedCharacterId,
    t,
  ])

  const handleSubmitAndGenerate = useCallback(async () => {
    if (isSubAppearance) {
      await handleSubmit()
      return
    }

    if (!name.trim() || !description.trim()) return

    try {
      setIsSubmitting(true)

      if (mode === 'asset-hub') {
        const result = await createAssetHubCharacter.mutateAsync({
          name: name.trim(),
          description: description.trim(),
          folderId: folderId ?? null,
          artStyle,
        }) as CreatedCharacterResponse
        const createdCharacterId = result.character?.id
        const createdAppearanceIndex = result.character?.appearances?.[0]?.appearanceIndex
        if (!createdCharacterId || createdAppearanceIndex === undefined) {
          throw new Error(t('errors.createFailed'))
        }
        await generateAssetHubCharacterImage.mutateAsync({
          characterId: createdCharacterId,
          appearanceIndex: createdAppearanceIndex,
          artStyle,
          count: characterGenerationCount,
        })
      } else {
        const result = await createProjectCharacter.mutateAsync({
          name: name.trim(),
          description: description.trim(),
        }) as CreatedCharacterResponse
        const createdCharacterId = result.character?.id
        const createdAppearanceId = result.character?.appearances?.[0]?.id
        if (!createdCharacterId || !createdAppearanceId) {
          throw new Error(t('errors.createFailed'))
        }
        await generateProjectCharacterImage.mutateAsync({
          characterId: createdCharacterId,
          appearanceId: createdAppearanceId,
          count: characterGenerationCount,
        })
      }

      onSuccess()
      onClose()
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(getErrorMessage(error, t('errors.createFailed')))
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [
    artStyle,
    characterGenerationCount,
    createAssetHubCharacter,
    createProjectCharacter,
    description,
    folderId,
    generateAssetHubCharacterImage,
    generateProjectCharacterImage,
    handleSubmit,
    isSubAppearance,
    mode,
    name,
    onClose,
    onSuccess,
    t,
  ])

  return {
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
  }
}
