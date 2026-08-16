'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProjectData, useUserModels } from '@/lib/query/hooks'
import type { UserModelOption } from '@/lib/query/hooks/useUserModels'
import {
  normalizeVideoGenerationSelections,
  resolveEffectiveVideoCapabilityDefinitions,
  resolveEffectiveVideoCapabilityFields,
} from '@/lib/model-capabilities/video-effective'
import type { CapabilityValue, VideoCapabilities } from '@/lib/model-config-contract'
import type { VideoPricingTier } from '@/lib/model-pricing/video-tier'
import { deriveDefaultVideoDuration } from './duration'
import { readShotGroupCapabilitySelection } from '@/lib/shot-group/video-config'

/**
 * 共享的视频生成参数 hook（成片页单镜头与 unit 面板共用）。
 *
 * 输入项目默认模型/覆盖项 + 用户模型列表，输出：
 *  - 模型选项（videoModelOptions）与当前选中模型
 *  - 有效能力字段（duration / resolution / generateAudio）
 *  - 归一化的本次生成选项（项目默认 + 时长默认 = deriveDefaultVideoDuration）
 *
 * 语义与成片页一致：本次修改只影响本次生成，不写回项目默认配置。
 */

export const VISIBLE_VIDEO_CAPABILITY_FIELDS = ['duration', 'resolution', 'generateAudio'] as const

export type VideoModelOption = {
  value: string
  label: string
  provider?: string
  providerName?: string
  capabilities?: unknown
  videoPricingTiers?: unknown
}

export function toCapabilityFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    duration: '时长',
    resolution: '分辨率',
    generateAudio: '生成音频',
    seed: '随机种子',
    fps: '帧率',
  }
  return labels[field] ?? field
}

function parseGenerationOptionValue(raw: string | boolean, sample: CapabilityValue): CapabilityValue {
  if (typeof sample === 'boolean') return Boolean(raw)
  if (typeof sample === 'number') return Number(raw)
  return String(raw)
}

export function useVideoGenerationParams(input: {
  projectId: string
  /** 默认时长依据（单镜头 = 镜头时长；unit = 成员总时长） */
  shotDurationSeconds: number
  defaultModel: string
  capabilityOverrides: Record<string, unknown> | undefined
}) {
  const projectQuery = useProjectData(input.projectId)
  const modelsQuery = useUserModels()

  const videoModelOptions = useMemo(() => {
    const videoModels = (modelsQuery.data?.video ?? []) as UserModelOption[]
    return videoModels.map((model) => ({
      value: model.value,
      label: model.label,
      provider: model.provider,
      providerName: model.providerName,
      capabilities: model.capabilities,
      videoPricingTiers: model.videoPricingTiers,
    }))
  }, [modelsQuery.data])

  const [selectedModel, setSelectedModel] = useState(input.defaultModel)
  useEffect(() => {
    if (input.defaultModel && !selectedModel) {
      setSelectedModel(input.defaultModel)
    }
  }, [input.defaultModel, selectedModel])

  const selectedModelOption = useMemo(
    () => videoModelOptions.find((opt) => opt.value === selectedModel),
    [videoModelOptions, selectedModel],
  )

  const capabilityDefinitions = useMemo(() => {
    try {
      return resolveEffectiveVideoCapabilityDefinitions({
        videoCapabilities: (selectedModelOption?.capabilities as { video?: VideoCapabilities } | undefined)?.video,
        pricingTiers: selectedModelOption?.videoPricingTiers as VideoPricingTier[] | undefined,
      })
    } catch {
      return []
    }
  }, [selectedModelOption])

  const visibleCapabilityFields = useMemo(
    () =>
      resolveEffectiveVideoCapabilityFields({ definitions: capabilityDefinitions }).filter((field) =>
        (VISIBLE_VIDEO_CAPABILITY_FIELDS as readonly string[]).includes(field.field),
      ),
    [capabilityDefinitions],
  )

  const [generationOptions, setGenerationOptions] = useState<Record<string, CapabilityValue>>({})

  // 模型/能力定义变化时归一化选项（项目默认 + 默认时长）。
  useEffect(() => {
    if (!selectedModel || capabilityDefinitions.length === 0) return
    const projectDefaults = readShotGroupCapabilitySelection(
      { video: input.capabilityOverrides ?? {} } as never,
      selectedModel,
    )
    const defaultDuration = deriveDefaultVideoDuration(input.shotDurationSeconds, capabilityDefinitions)
    const normalized = normalizeVideoGenerationSelections({
      definitions: capabilityDefinitions,
      pricingTiers: selectedModelOption?.videoPricingTiers as VideoPricingTier[] | undefined,
      selection: {
        ...projectDefaults,
        duration: defaultDuration,
      },
    })
    setGenerationOptions(normalized)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel, capabilityDefinitions.length, input.shotDurationSeconds])

  const handleModelChange = useCallback((modelKey: string) => {
    setSelectedModel(modelKey)
  }, [])

  const handleCapabilityChange = useCallback((field: string, rawValue: string | boolean) => {
    if (!capabilityDefinitions.length) return
    const fieldDef = capabilityDefinitions.find((d) => d.field === field)
    const sample = fieldDef?.options?.[0] ?? ''
    const parsedValue = parseGenerationOptionValue(rawValue, sample as CapabilityValue)
    const normalized = normalizeVideoGenerationSelections({
      definitions: capabilityDefinitions,
      pricingTiers: selectedModelOption?.videoPricingTiers as VideoPricingTier[] | undefined,
      selection: { ...generationOptions, [field]: parsedValue },
      pinnedFields: [field],
    })
    setGenerationOptions(normalized)
  }, [capabilityDefinitions, generationOptions, selectedModelOption])

  return {
    videoModelOptions,
    selectedModel,
    handleModelChange,
    capabilityDefinitions,
    visibleCapabilityFields,
    generationOptions,
    handleCapabilityChange,
  }
}
