import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { executeAiTextStep } from '@/lib/ai-runtime'
import { safeParseJsonArray, safeParseJsonObject } from '@/lib/json-repair'
import {
  getUserWorkflowConcurrencyConfig,
  resolveProjectModelCapabilityGenerationOptions,
} from '@/lib/config-service'
import { buildCharactersIntroduction } from '@/lib/constants'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { logAIAnalysis } from '@/lib/logging/semantic'
import { onProjectNameAvailable } from '@/lib/logging/file-writer'
import { TaskTerminatedError } from '@/lib/task/errors'
import { reportTaskProgress } from '@/lib/workers/shared'
import {
  runStoryToScriptOrchestrator,
  type StoryToScriptClipCandidate,
  type StoryToScriptOrchestratorInput,
  type StoryToScriptStepMeta,
  type StoryToScriptStepOutput,
  type StoryToScriptOrchestratorResult,
} from '@/lib/novel-promotion/story-to-script/orchestrator'
import { createClipContentMatcher } from '@/lib/novel-promotion/story-to-script/clip-matching'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from './llm-stream'
import type { TaskJobData } from '@/lib/task/types'
import {
  asString,
  type AnyObj,
  parseEffort,
  parseTemperature,
  persistAnalyzedCharacters,
  persistAnalyzedLocations,
  persistAnalyzedProps,
  persistClips,
  resolveClipRecordId,
} from './story-to-script-helpers'
import { getPromptTemplate, PROMPT_IDS } from '@/lib/prompt-i18n'
import { resolveAnalysisModel } from './resolve-analysis-model'
import { createArtifact, listArtifacts } from '@/lib/run-runtime/service'
import { assertWorkflowRunActive, withWorkflowRunLease } from '@/lib/run-runtime/workflow-lease'
import { parseScreenplayPayload } from './screenplay-convert-helpers'

function readAssetKind(value: Record<string, unknown>): string {
  return typeof value.assetKind === 'string' ? value.assetKind : 'location'
}

function isReasoningEffort(value: unknown): value is 'minimal' | 'low' | 'medium' | 'high' {
  return value === 'minimal' || value === 'low' || value === 'medium' || value === 'high'
}

function resolveRetryClipId(retryStepKey: string): string | null {
  if (!retryStepKey.startsWith('screenplay_')) return null
  const clipId = retryStepKey.slice('screenplay_'.length).trim()
  return clipId || null
}

function isAnalysisRetryStepKey(
  retryStepKey: string,
): retryStepKey is 'analyze_characters' | 'analyze_locations' | 'analyze_props' {
  return retryStepKey === 'analyze_characters'
    || retryStepKey === 'analyze_locations'
    || retryStepKey === 'analyze_props'
}

const MAX_SPLIT_BOUNDARY_ATTEMPTS = 2
const CLIP_BOUNDARY_SUFFIX = `

[Boundary Constraints]
1. The "start" and "end" anchors must come from the original text and be locatable.
2. Allow punctuation/whitespace differences, but do not rewrite key entities or events.
3. If anchors cannot be located reliably, return [] directly.`

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function parseClipArrayResponse(responseText: string): Array<Record<string, unknown>> {
  return safeParseJsonArray(responseText, 'clips')
}

function computeStepProgress(meta: StoryToScriptStepMeta) {
  return 15 + Math.min(55, Math.floor((meta.stepIndex / Math.max(1, meta.stepTotal)) * 55))
}

function readArtifactPayload(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readArtifactRows(payload: Record<string, unknown> | null, key: string): Record<string, unknown>[] {
  const value = payload?.[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
}

function extractAnalyzedCharacters(payload: Record<string, unknown> | null): Record<string, unknown>[] {
  const characters = readArtifactRows(payload, 'characters')
  if (characters.length > 0) return characters
  return readArtifactRows(payload, 'new_characters')
}

function extractAnalyzedLocations(payload: Record<string, unknown> | null): Record<string, unknown>[] {
  return readArtifactRows(payload, 'locations')
}

function extractAnalyzedProps(payload: Record<string, unknown> | null): Record<string, unknown>[] {
  return readArtifactRows(payload, 'props')
}

function resolveStoryToScriptLibraries(params: {
  novelData: {
    characters: Array<{ name: string; introduction?: string | null }>
    locations: Array<{ name: string; summary?: string | null; assetKind?: string | null }>
  }
  analysisArtifacts: {
    characters: Record<string, unknown> | null
    locations: Record<string, unknown> | null
    props: Record<string, unknown> | null
  }
}) {
  const baseCharacters = params.novelData.characters.map((item) => item.name)
  const baseLocations = params.novelData.locations
    .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) !== 'prop')
    .map((item) => item.name)
  const baseProps = params.novelData.locations
    .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) === 'prop')
    .map((item) => item.name)
  const baseCharacterIntroductions = params.novelData.characters.map((item) => ({
    name: item.name,
    introduction: item.introduction || '',
  }))

  const analyzedCharacters = readArtifactRows(params.analysisArtifacts.characters, 'characters')
  const analyzedLocations = readArtifactRows(params.analysisArtifacts.locations, 'locations')
  const analyzedProps = readArtifactRows(params.analysisArtifacts.props, 'props')

  const analyzedCharacterNames = analyzedCharacters
    .map((item) => asString(item.name).trim())
    .filter(Boolean)
  const analyzedLocationNames = analyzedLocations
    .map((item) => asString(item.name).trim())
    .filter(Boolean)
  const analyzedPropNames = analyzedProps
    .map((item) => asString(item.name).trim())
    .filter(Boolean)

  const analyzedCharacterNameSet = new Set(analyzedCharacterNames)
  const analyzedPropNameSet = new Set(analyzedPropNames)

  const charactersLibName = (analyzedCharacterNames.length > 0
    ? [...analyzedCharacterNames, ...baseCharacters.filter((name) => !analyzedCharacterNameSet.has(name))]
    : baseCharacters).join('、') || '无'
  const locationsLibName = (analyzedLocationNames.length > 0 ? analyzedLocationNames : baseLocations).join('、') || '无'
  const propsLibName = (analyzedPropNames.length > 0
    ? [...analyzedPropNames, ...baseProps.filter((name) => !analyzedPropNameSet.has(name))]
    : baseProps).join('、') || '无'

  const mergedCharacterIntroductions = analyzedCharacters.length > 0
    ? [
      ...analyzedCharacters.map((item) => ({
        name: asString(item.name),
        introduction: asString(item.introduction),
      })),
      ...baseCharacterIntroductions.filter((item) => !analyzedCharacterNameSet.has(item.name)),
    ]
    : baseCharacterIntroductions

  return {
    charactersLibName,
    locationsLibName,
    propsLibName,
    charactersIntroduction: buildCharactersIntroduction(mergedCharacterIntroductions),
  }
}

function buildWorkflowWorkerId(job: Job<TaskJobData>, label: string) {
  return `${label}:${job.queueName}:${job.data.taskId}`
}

function resolveRetrySourceStepTitle(stepKey: string): string {
  if (stepKey === 'analyze_characters') return 'progress.streamStep.analyzeCharacters'
  if (stepKey === 'analyze_locations') return 'progress.streamStep.analyzeLocations'
  if (stepKey === 'analyze_props') return 'progress.streamStep.analyzeProps'
  if (stepKey === 'split_clips') return 'progress.streamStep.splitClips'
  return 'progress.stage.storyToScriptPersistDone'
}

export async function handleStoryToScriptTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const projectId = job.data.projectId
  const episodeIdRaw = asString(payload.episodeId || job.data.episodeId || '')
  const episodeId = episodeIdRaw.trim()
  const contentRaw = asString(payload.content)
  const inputModel = asString(payload.model).trim()
  const retryStepKey = asString(payload.retryStepKey).trim()
  const retryStepAttempt = typeof payload.retryStepAttempt === 'number' && Number.isFinite(payload.retryStepAttempt)
    ? Math.max(1, Math.floor(payload.retryStepAttempt))
    : 1
  const reasoning = payload.reasoning !== false
  const requestedReasoningEffort = parseEffort(payload.reasoningEffort)
  const temperature = parseTemperature(payload.temperature)

  if (!episodeId) {
    throw new Error('episodeId is required')
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
    },
  })
  if (!project) {
    throw new Error('Project not found')
  }

  // Register project name for per-project log file routing
  onProjectNameAvailable(projectId, project.name)

  const novelData = await prisma.novelPromotionProject.findUnique({
    where: { projectId },
    include: {
      characters: true,
      locations: true,
    },
  })
  if (!novelData) {
    throw new Error('Novel promotion data not found')
  }

  const episode = await prisma.novelPromotionEpisode.findUnique({
    where: { id: episodeId },
    select: {
      id: true,
      novelPromotionProjectId: true,
      novelText: true,
    },
  })
  if (!episode || episode.novelPromotionProjectId !== novelData.id) {
    throw new Error('Episode not found')
  }

  const model = await resolveAnalysisModel({
    userId: job.data.userId,
    inputModel,
    projectAnalysisModel: novelData.analysisModel,
  })
  const [llmCapabilityOptions, workflowConcurrency] = await Promise.all([
    resolveProjectModelCapabilityGenerationOptions({
      projectId,
      userId: job.data.userId,
      modelType: 'llm',
      modelKey: model,
    }),
    getUserWorkflowConcurrencyConfig(job.data.userId),
  ])
  const capabilityReasoningEffort = llmCapabilityOptions.reasoningEffort
  const reasoningEffort = requestedReasoningEffort
    || (isReasoningEffort(capabilityReasoningEffort) ? capabilityReasoningEffort : 'high')

  const mergedContent = contentRaw.trim() || (episode.novelText || '')
  if (!mergedContent.trim()) {
    throw new Error('content is required')
  }
  const characterPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_AGENT_CHARACTER_PROFILE, job.data.locale)
  const locationPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_SELECT_LOCATION, job.data.locale)
  const propPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_SELECT_PROP, job.data.locale)
  const clipPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_AGENT_CLIP, job.data.locale)
  const screenplayPromptTemplate = getPromptTemplate(PROMPT_IDS.NP_SCREENPLAY_CONVERSION, job.data.locale)
  const maxLength = 30000
  const content = mergedContent.length > maxLength ? mergedContent.slice(0, maxLength) : mergedContent
  const payloadMeta = typeof payload.meta === 'object' && payload.meta !== null
    ? (payload.meta as AnyObj)
    : {}
  const runId = typeof payload.runId === 'string' && payload.runId.trim()
    ? payload.runId.trim()
    : (typeof payloadMeta.runId === 'string' ? payloadMeta.runId.trim() : '')
  if (!runId) {
    throw new Error('runId is required for story_to_script pipeline')
  }
  const retryClipId = resolveRetryClipId(retryStepKey)
  const retryAnalysisStepKey = isAnalysisRetryStepKey(retryStepKey) ? retryStepKey : null
  if (retryStepKey && retryStepKey !== 'split_clips' && !retryClipId && !retryAnalysisStepKey) {
    throw new Error(`unsupported retry step for story_to_script: ${retryStepKey}`)
  }
  const workerId = buildWorkflowWorkerId(job, 'story_to_script')
  const assertRunActive = async (stage: string) => {
    await assertWorkflowRunActive({
      runId,
      workerId,
      stage,
    })
  }
  const streamContext = createWorkerLLMStreamContext(job, 'story_to_script')
  const callbacks = createWorkerLLMStreamCallbacks(job, streamContext, {
    assertActive: async (stage) => {
      await assertRunActive(stage)
    },
    isActive: async () => {
      try {
        await assertRunActive('worker_llm_stream_probe')
        return true
      } catch (error) {
        if (error instanceof TaskTerminatedError) {
          return false
        }
        throw error
      }
    },
  })

  const runStep = async (
    meta: StoryToScriptStepMeta,
    prompt: string,
    action: string,
    _maxOutputTokens: number,
  ): Promise<StoryToScriptStepOutput> => {
    void _maxOutputTokens
    const stepAttempt = meta.stepAttempt
      || (retryStepKey && meta.stepId === retryStepKey ? retryStepAttempt : 1)
    await assertRunActive(`story_to_script_step:${meta.stepId}`)
    const progress = 15 + Math.min(55, Math.floor((meta.stepIndex / Math.max(1, meta.stepTotal)) * 55))
    await reportTaskProgress(job, progress, {
      stage: 'story_to_script_step',
      stageLabel: 'progress.stage.storyToScriptStep',
      displayMode: 'detail',
      message: meta.stepTitle,
      stepId: meta.stepId,
      stepAttempt,
      stepTitle: meta.stepTitle,
      stepIndex: meta.stepIndex,
      stepTotal: meta.stepTotal,
      dependsOn: Array.isArray(meta.dependsOn) ? meta.dependsOn : [],
      groupId: meta.groupId || null,
      parallelKey: meta.parallelKey || null,
      retryable: meta.retryable !== false,
      blockedBy: Array.isArray(meta.blockedBy) ? meta.blockedBy : [],
    })

    logAIAnalysis(job.data.userId, 'worker', projectId, project.name, {
      action: `STORY_TO_SCRIPT_PROMPT:${action}`,
      input: { stepId: meta.stepId, stepTitle: meta.stepTitle, prompt },
      model,
    })

    const output = await executeAiTextStep({
      userId: job.data.userId,
      model,
      messages: [{ role: 'user', content: prompt }],
      projectId,
      action,
      meta: {
        ...meta,
        stepAttempt,
      },
      temperature,
      reasoning,
      reasoningEffort,
    })
    await callbacks.flush()

    logAIAnalysis(job.data.userId, 'worker', projectId, project.name, {
      action: `STORY_TO_SCRIPT_OUTPUT:${action}`,
      output: {
        stepId: meta.stepId,
        stepTitle: meta.stepTitle,
        rawText: output.text,
        textLength: output.text.length,
        reasoningLength: output.reasoning.length,
      },
      model,
    })

    return {
      text: output.text,
      reasoning: output.reasoning,
    }
  }

  const reportStepError: NonNullable<StoryToScriptOrchestratorInput['onStepError']> = async (meta, message) => {
    await reportTaskProgress(job, computeStepProgress(meta), {
      stage: 'error',
      displayMode: 'detail',
      message,
      stepId: meta.stepId,
      stepKey: meta.stepId,
      stepAttempt: meta.stepAttempt || (retryStepKey && meta.stepId === retryStepKey ? retryStepAttempt : 1),
      stepTitle: meta.stepTitle,
      stepIndex: meta.stepIndex,
      stepTotal: meta.stepTotal,
      dependsOn: Array.isArray(meta.dependsOn) ? meta.dependsOn : [],
      groupId: meta.groupId || null,
      parallelKey: meta.parallelKey || null,
      retryable: meta.retryable !== false,
      blockedBy: Array.isArray(meta.blockedBy) ? meta.blockedBy : [],
      error: {
        message,
      },
    })
  }

  const runScreenplayStep = async (params: {
    stepMeta: StoryToScriptStepMeta
    clipId: string
    clipContent: string
    startText?: string | null
    endText?: string | null
    summary?: string | null
    location?: string | null
    characters?: string[]
    props?: string[]
    libraries: {
      locationsLibName: string
      charactersLibName: string
      propsLibName: string
      charactersIntroduction: string
    }
  }) => {
    const screenplayPrompt = screenplayPromptTemplate
      .replace('{clip_content}', params.clipContent)
      .replace('{locations_lib_name}', params.libraries.locationsLibName || '无')
      .replace('{characters_lib_name}', params.libraries.charactersLibName || '无')
      .replace('{props_lib_name}', params.libraries.propsLibName || '无')
      .replace('{characters_introduction}', params.libraries.charactersIntroduction || '暂无角色介绍')
      .replace('{clip_id}', params.clipId)

    let screenplay: AnyObj | null = null
    try {
      const stepOutput = await (async () => {
        try {
          return await withInternalLLMStreamCallbacks(
            callbacks,
            async () => await runStep(params.stepMeta, screenplayPrompt, 'screenplay_conversion', 2200),
          )
        } finally {
          await callbacks.flush()
        }
      })()
      screenplay = parseScreenplayPayload(stepOutput.text)
      if (!screenplay) {
        throw new Error('retry screenplay output is empty')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await reportStepError(params.stepMeta, message)
      await createArtifact({
        runId,
        stepKey: params.stepMeta.stepId,
        artifactType: 'screenplay.clip',
        refId: params.clipId,
        payload: {
          clipId: params.clipId,
          success: false,
          error: message,
        },
      })
      throw error
    }

    await createArtifact({
      runId,
      stepKey: params.stepMeta.stepId,
      artifactType: 'screenplay.clip',
      refId: params.clipId,
      payload: {
        clipId: params.clipId,
        success: true,
        sceneCount: Array.isArray(screenplay.scenes) ? screenplay.scenes.length : 0,
        screenplay,
        startText: params.startText || null,
        endText: params.endText || null,
        summary: params.summary || null,
        location: params.location || null,
        characters: params.characters || [],
        props: params.props || [],
      },
    })

    return screenplay
  }

  const loadAnalysisArtifacts = async () => {
    const [characterArtifacts, locationArtifacts, propArtifacts] = await Promise.all([
      listArtifacts({
        runId,
        artifactType: 'analysis.characters',
        refId: episodeId,
        limit: 1,
      }),
      listArtifacts({
        runId,
        artifactType: 'analysis.locations',
        refId: episodeId,
        limit: 1,
      }),
      listArtifacts({
        runId,
        artifactType: 'analysis.props',
        refId: episodeId,
        limit: 1,
      }),
    ])

    return {
      characters: readArtifactPayload(characterArtifacts[0]?.payload),
      locations: readArtifactPayload(locationArtifacts[0]?.payload),
      props: readArtifactPayload(propArtifacts[0]?.payload),
    }
  }

  const retryAnalysisStep = async (
    stepKey: 'analyze_characters' | 'analyze_locations' | 'analyze_props',
  ): Promise<Record<string, unknown> | null> => {
    const baseCharacters = (novelData.characters || []).map((item) => item.name)
    const baseLocations = (novelData.locations || [])
      .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) !== 'prop')
      .map((item) => item.name)
    const baseProps = (novelData.locations || [])
      .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) === 'prop')
      .map((item) => item.name)
    const baseCharacterInfo = (novelData.characters || []).length > 0
      ? (novelData.characters || []).map((item, index) => `${index + 1}. ${item.name}`).join('\n')
      : '暂无已有角色'
    let prompt = ''
    let action = ''
    let stepTitle = ''
    let artifactType = ''

    if (stepKey === 'analyze_characters') {
      prompt = characterPromptTemplate
        .replace('{input}', content)
        .replace('{characters_lib_name}', baseCharacters.join('、') || '无')
        .replace('{characters_lib_info}', baseCharacterInfo)
      action = 'analyze_characters'
      stepTitle = 'progress.streamStep.analyzeCharacters'
      artifactType = 'analysis.characters'
    } else if (stepKey === 'analyze_locations') {
      prompt = locationPromptTemplate
        .replace('{input}', content)
        .replace('{locations_lib_name}', baseLocations.join('、') || '无')
      action = 'analyze_locations'
      stepTitle = 'progress.streamStep.analyzeLocations'
      artifactType = 'analysis.locations'
    } else {
      prompt = propPromptTemplate
        .replace('{input}', content)
        .replace('{props_lib_name}', baseProps.join('、') || '无')
      action = 'analyze_props'
      stepTitle = 'progress.streamStep.analyzeProps'
      artifactType = 'analysis.props'
    }

    const stepOutput = await (async () => {
      try {
        return await withInternalLLMStreamCallbacks(
          callbacks,
          async () => await runStep({
            stepId: stepKey,
            stepAttempt: retryStepAttempt,
            stepTitle,
            stepIndex: 1,
            stepTotal: 1,
            groupId: 'analysis',
            parallelKey: stepKey.replace('analyze_', ''),
            retryable: true,
          }, prompt, action, 2200),
        )
      } finally {
        await callbacks.flush()
      }
    })()

    const raw = safeParseJsonObject(stepOutput.text)
    const payload = stepKey === 'analyze_characters'
      ? {
        characters: extractAnalyzedCharacters(raw),
        raw,
      }
      : stepKey === 'analyze_locations'
        ? {
          locations: extractAnalyzedLocations(raw),
          raw,
        }
        : {
          props: extractAnalyzedProps(raw),
          raw,
        }

    await createArtifact({
      runId,
      stepKey,
      artifactType,
      refId: episodeId,
      payload,
    })

    return payload
  }

  const rerunFromAnalysisArtifacts = async (params: {
    analysisArtifacts: {
      characters: Record<string, unknown> | null
      locations: Record<string, unknown> | null
      props: Record<string, unknown> | null
    }
    retrySourceStepKey: string
    retrySourceStepAttempt: number
    persistAnalysisArtifacts: boolean
  }) => {
    const libraries = resolveStoryToScriptLibraries({
      novelData: {
        characters: novelData.characters || [],
        locations: (novelData.locations || []).map((item) => ({
          name: item.name,
          summary: item.summary || null,
          assetKind: readAssetKind(item as unknown as Record<string, unknown>),
        })),
      },
      analysisArtifacts: params.analysisArtifacts,
    })

    const splitPrompt = `${clipPromptTemplate
      .replace('{input}', content)
      .replace('{locations_lib_name}', libraries.locationsLibName || '无')
      .replace('{characters_lib_name}', libraries.charactersLibName || '无')
      .replace('{props_lib_name}', libraries.propsLibName || '无')
      .replace('{characters_introduction}', libraries.charactersIntroduction || '暂无角色介绍')}${CLIP_BOUNDARY_SUFFIX}`

    let splitStep: StoryToScriptStepOutput | null = null
    let clipList: StoryToScriptClipCandidate[] = []
    let lastBoundaryError: Error | null = null

    for (let attempt = 1; attempt <= MAX_SPLIT_BOUNDARY_ATTEMPTS; attempt += 1) {
      const splitMeta: StoryToScriptStepMeta = {
        stepId: 'split_clips',
        stepAttempt: params.retrySourceStepKey === 'split_clips'
          ? params.retrySourceStepAttempt + attempt - 1
          : attempt,
        stepTitle: 'progress.streamStep.splitClips',
        stepIndex: 1,
        stepTotal: 1,
        dependsOn: ['analyze_characters', 'analyze_locations', 'analyze_props'],
        retryable: true,
      }
      const stepOutput = await (async () => {
        try {
          return await withInternalLLMStreamCallbacks(
            callbacks,
            async () => await runStep(splitMeta, splitPrompt, 'split_clips', 2600),
          )
        } finally {
          await callbacks.flush()
        }
      })()
      const rawClipList = parseClipArrayResponse(stepOutput.text)
      if (rawClipList.length === 0) {
        lastBoundaryError = new Error('split_clips returned empty clips')
        continue
      }

      const matcher = createClipContentMatcher(content)
      const nextClipList: StoryToScriptClipCandidate[] = []
      let searchFrom = 0
      let failedAt: { clipId: string; startText: string; endText: string } | null = null

      for (let index = 0; index < rawClipList.length; index += 1) {
        const item = rawClipList[index]
        const startText = asString(item.start)
        const endText = asString(item.end)
        const clipId = `clip_${index + 1}`
        const match = matcher.matchBoundary(startText, endText, searchFrom)
        if (!match) {
          failedAt = { clipId, startText, endText }
          break
        }

        nextClipList.push({
          id: clipId,
          startText,
          endText,
          summary: asString(item.summary),
          location: asString(item.location) || null,
          characters: toStringArray(item.characters),
          props: toStringArray(item.props),
          content: content.slice(match.startIndex, match.endIndex),
          matchLevel: match.level,
          matchConfidence: match.confidence,
        })
        searchFrom = match.endIndex
      }

      if (!failedAt) {
        splitStep = stepOutput
        clipList = nextClipList
        break
      }

      lastBoundaryError = new Error(
        `split_clips boundary matching failed at ${failedAt.clipId}: start="${failedAt.startText}" end="${failedAt.endText}"`,
      )
    }

    if (!splitStep) {
      const errorMessage = (lastBoundaryError || new Error('split_clips boundary matching failed')).message
      await reportStepError({
        stepId: 'split_clips',
        stepAttempt: params.retrySourceStepAttempt,
        stepTitle: 'progress.streamStep.splitClips',
        stepIndex: 1,
        stepTotal: 1,
        dependsOn: ['analyze_characters', 'analyze_locations', 'analyze_props'],
        retryable: true,
      }, errorMessage)
      throw lastBoundaryError || new Error('split_clips boundary matching failed')
    }

    await createArtifact({
      runId,
      stepKey: 'split_clips',
      artifactType: 'clips.split',
      refId: episodeId,
      payload: {
        clipList,
        charactersLibName: libraries.charactersLibName,
        locationsLibName: libraries.locationsLibName,
        propsLibName: libraries.propsLibName,
        charactersIntroduction: libraries.charactersIntroduction,
      },
    })

    const screenplayResults: Array<{
      clipId: string
      success: boolean
      sceneCount: number
      screenplay?: AnyObj
      error?: string
    }> = []

    for (let index = 0; index < clipList.length; index += 1) {
      const clip = clipList[index]
      const stepMeta: StoryToScriptStepMeta = {
        stepId: `screenplay_${clip.id}`,
        stepTitle: 'progress.streamStep.screenplayConversion',
        stepIndex: index + 1,
        stepTotal: clipList.length || 1,
        dependsOn: ['split_clips'],
        groupId: 'screenplay_conversion',
        parallelKey: clip.id,
        retryable: true,
      }

      try {
        const screenplay = await runScreenplayStep({
          stepMeta,
          clipId: clip.id,
          clipContent: clip.content,
          startText: clip.startText,
          endText: clip.endText,
          summary: clip.summary,
          location: clip.location,
          characters: clip.characters,
          props: clip.props,
          libraries,
        })
        screenplayResults.push({
          clipId: clip.id,
          success: true,
          sceneCount: Array.isArray(screenplay.scenes) ? screenplay.scenes.length : 0,
          screenplay,
        })
      } catch (error) {
        screenplayResults.push({
          clipId: clip.id,
          success: false,
          sceneCount: 0,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await reportTaskProgress(job, 80, {
      stage: 'story_to_script_persist',
      stageLabel: 'progress.stage.storyToScriptPersist',
      displayMode: 'detail',
    })
    await assertRunActive('story_to_script_persist')

    const analyzedCharacters = extractAnalyzedCharacters(params.analysisArtifacts.characters)
    const analyzedLocations = extractAnalyzedLocations(params.analysisArtifacts.locations)
    const analyzedProps = extractAnalyzedProps(params.analysisArtifacts.props)

    const existingCharacterNames = new Set<string>(
      (novelData.characters || []).map((item) => String(item.name || '').toLowerCase()),
    )
    const existingLocationNames = new Set<string>(
      (novelData.locations || [])
        .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) !== 'prop')
        .map((item) => String(item.name || '').toLowerCase()),
    )
    const existingPropNames = new Set<string>(
      (novelData.locations || [])
        .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) === 'prop')
        .map((item) => String(item.name || '').toLowerCase()),
    )

    const persistedResult = await prisma.$transaction(async (tx) => {
      const createdCharacters = params.persistAnalysisArtifacts
        ? await persistAnalyzedCharacters({
          projectInternalId: novelData.id,
          existingNames: existingCharacterNames,
          analyzedCharacters,
          db: tx,
        })
        : []
      const createdLocations = params.persistAnalysisArtifacts
        ? await persistAnalyzedLocations({
          projectInternalId: novelData.id,
          existingNames: existingLocationNames,
          analyzedLocations,
          db: tx,
        })
        : []
      const createdProps = params.persistAnalysisArtifacts
        ? await persistAnalyzedProps({
          projectInternalId: novelData.id,
          existingNames: existingPropNames,
          analyzedProps,
          db: tx,
        })
        : []

      const createdClipRows = await persistClips({
        episodeId,
        clipList,
        db: tx,
      })
      const clipIdMap = new Map(createdClipRows.map((item) => [item.clipKey, item.id]))

      for (const screenplayResult of screenplayResults) {
        if (!screenplayResult.success || !screenplayResult.screenplay) continue
        const clipRecordId = resolveClipRecordId(clipIdMap, screenplayResult.clipId)
        if (!clipRecordId) continue
        await tx.novelPromotionClip.update({
          where: { id: clipRecordId },
          data: {
            screenplay: JSON.stringify(screenplayResult.screenplay),
          },
        })
      }

      return {
        createdCharacters,
        createdLocations,
        createdProps,
        createdClipRows,
      }
    })

    const screenplayFailedCount = screenplayResults.filter((item) => !item.success).length
    if (screenplayFailedCount > 0) {
      const preview = screenplayResults
        .filter((item) => !item.success)
        .slice(0, 3)
        .map((item) => `${item.clipId}:${item.error || 'unknown error'}`)
        .join(' | ')
      throw new Error(
        `STORY_TO_SCRIPT_PARTIAL_FAILED: ${screenplayFailedCount}/${clipList.length} screenplay steps failed. ${preview}`,
      )
    }

    await reportTaskProgress(job, 96, {
      stage: 'story_to_script_persist_done',
      stageLabel: 'progress.stage.storyToScriptPersistDone',
      displayMode: 'detail',
      message: 'retry step completed',
      stepId: params.retrySourceStepKey,
      stepAttempt: params.retrySourceStepAttempt,
      stepTitle: resolveRetrySourceStepTitle(params.retrySourceStepKey),
      stepIndex: 1,
      stepTotal: 1,
    })

    return {
      episodeId,
      clipCount: clipList.length,
      screenplaySuccessCount: screenplayResults.length,
      screenplayFailedCount: 0,
      persistedCharacters: persistedResult.createdCharacters.length,
      persistedLocations: persistedResult.createdLocations.length,
      persistedProps: persistedResult.createdProps.length,
      persistedClips: persistedResult.createdClipRows.length,
      retryStepKey: params.retrySourceStepKey,
    }
  }

  const leaseResult = await withWorkflowRunLease({
    runId,
    userId: job.data.userId,
    workerId,
    run: async () => {
      await reportTaskProgress(job, 10, {
        stage: 'story_to_script_prepare',
        stageLabel: 'progress.stage.storyToScriptPrepare',
        displayMode: 'detail',
      })

      if (retryStepKey === 'split_clips') {
        return await rerunFromAnalysisArtifacts({
          analysisArtifacts: await loadAnalysisArtifacts(),
          retrySourceStepKey: retryStepKey,
          retrySourceStepAttempt: retryStepAttempt,
          persistAnalysisArtifacts: false,
        })
      }

      if (retryAnalysisStepKey) {
        const analysisArtifacts = await loadAnalysisArtifacts()
        analysisArtifacts[
          retryAnalysisStepKey === 'analyze_characters'
            ? 'characters'
            : retryAnalysisStepKey === 'analyze_locations'
              ? 'locations'
              : 'props'
        ] = await retryAnalysisStep(retryAnalysisStepKey)

        return await rerunFromAnalysisArtifacts({
          analysisArtifacts,
          retrySourceStepKey: retryAnalysisStepKey,
          retrySourceStepAttempt: retryStepAttempt,
          persistAnalysisArtifacts: true,
        })
      }

      if (retryClipId) {
        const splitArtifacts = await listArtifacts({
          runId,
          artifactType: 'clips.split',
          limit: 1,
        })
        const latestSplit = splitArtifacts[0]
        const splitPayload = latestSplit && typeof latestSplit.payload === 'object' && latestSplit.payload !== null
          ? (latestSplit.payload as Record<string, unknown>)
          : null
        if (!splitPayload) {
          throw new Error('missing clips.split artifact for retry')
        }

        const clipRows = Array.isArray(splitPayload.clipList) ? splitPayload.clipList : []
        const retryClip = clipRows.find((item) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return false
          return asString((item as Record<string, unknown>).id).trim() === retryClipId
        }) as Record<string, unknown> | undefined
        if (!retryClip) {
          throw new Error(`retry clip not found in artifact: ${retryClipId}`)
        }

        const clipContent = asString(retryClip.content)
        if (!clipContent.trim()) {
          throw new Error(`retry clip content is empty: ${retryClipId}`)
        }

        const stepMeta: StoryToScriptStepMeta = {
          stepId: retryStepKey,
          stepAttempt: retryStepAttempt,
          stepTitle: 'progress.streamStep.screenplayConversion',
          stepIndex: 1,
          stepTotal: 1,
          dependsOn: ['split_clips'],
          retryable: true,
        }
        const screenplay = await runScreenplayStep({
          stepMeta,
          clipId: retryClipId,
          clipContent,
          startText: asString(retryClip.startText) || null,
          endText: asString(retryClip.endText) || null,
          summary: asString(retryClip.summary) || null,
          location: asString(retryClip.location) || null,
          characters: toStringArray(retryClip.characters),
          props: toStringArray(retryClip.props),
          libraries: {
            locationsLibName: asString(splitPayload.locationsLibName) || '无',
            charactersLibName: asString(splitPayload.charactersLibName) || '无',
            propsLibName: asString(splitPayload.propsLibName) || '无',
            charactersIntroduction: asString(splitPayload.charactersIntroduction) || '暂无角色介绍',
          },
        })

        await prisma.$transaction(async (tx) => {
          let clipRecord = await tx.novelPromotionClip.findFirst({
            where: {
              episodeId,
              startText: asString(retryClip.startText) || null,
              endText: asString(retryClip.endText) || null,
            },
            select: { id: true },
          })
          if (!clipRecord) {
            const clipModel = tx.novelPromotionClip as unknown as {
              create: (args: { data: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }>
            }
            clipRecord = await clipModel.create({
              data: {
                episodeId,
                startText: asString(retryClip.startText) || null,
                endText: asString(retryClip.endText) || null,
                summary: asString(retryClip.summary),
                location: asString(retryClip.location) || null,
                characters: Array.isArray(retryClip.characters) ? JSON.stringify(retryClip.characters) : null,
                props: Array.isArray(retryClip.props) ? JSON.stringify(retryClip.props) : null,
                content: clipContent,
              },
              select: { id: true },
            })
          }
          await tx.novelPromotionClip.update({
            where: { id: clipRecord.id },
            data: {
              screenplay: JSON.stringify(screenplay),
            },
          })
        })

        await reportTaskProgress(job, 96, {
          stage: 'story_to_script_persist_done',
          stageLabel: 'progress.stage.storyToScriptPersistDone',
          displayMode: 'detail',
          message: 'retry step completed',
          stepId: retryStepKey,
          stepAttempt: retryStepAttempt,
          stepTitle: 'progress.streamStep.screenplayConversion',
          stepIndex: 1,
          stepTotal: 1,
        })

        return {
          episodeId,
          clipCount: 1,
          screenplaySuccessCount: 1,
          screenplayFailedCount: 0,
          persistedCharacters: 0,
          persistedLocations: 0,
          persistedClips: 1,
          retryStepKey,
        }
      }

      const result: StoryToScriptOrchestratorResult = await (async () => {
        try {
          return await withInternalLLMStreamCallbacks(
            callbacks,
            async () => await runStoryToScriptOrchestrator({
              concurrency: workflowConcurrency.analysis,
              content,
              baseCharacters: (novelData.characters || []).map((item) => item.name),
              baseLocations: (novelData.locations || [])
                .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) !== 'prop')
                .map((item) => item.name),
              baseProps: (novelData.locations || [])
                .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) === 'prop')
                .map((item) => item.name),
              baseCharacterIntroductions: (novelData.characters || []).map((item) => ({
                name: item.name,
                introduction: item.introduction || '',
              })),
              promptTemplates: {
                characterPromptTemplate,
                locationPromptTemplate,
                propPromptTemplate,
                clipPromptTemplate,
                screenplayPromptTemplate,
              },
              runStep,
              onStepError: reportStepError,
            }),
          )
        } finally {
          await callbacks.flush()
        }
      })()

      await createArtifact({
        runId,
        stepKey: 'analyze_characters',
        artifactType: 'analysis.characters',
        refId: episodeId,
        payload: {
          characters: result.analyzedCharacters,
          raw: result.charactersObject,
        },
      })
      await createArtifact({
        runId,
        stepKey: 'analyze_locations',
        artifactType: 'analysis.locations',
        refId: episodeId,
        payload: {
          locations: result.analyzedLocations,
          raw: result.locationsObject,
        },
      })
      await createArtifact({
        runId,
        stepKey: 'analyze_props',
        artifactType: 'analysis.props',
        refId: episodeId,
        payload: {
          props: result.analyzedProps,
          raw: result.propsObject,
        },
      })
      await createArtifact({
        runId,
        stepKey: 'split_clips',
        artifactType: 'clips.split',
        refId: episodeId,
        payload: {
          clipList: result.clipList,
          charactersLibName: result.charactersLibName,
          locationsLibName: result.locationsLibName,
          propsLibName: result.propsLibName,
          charactersIntroduction: result.charactersIntroduction,
        },
      })
      for (const screenplayResult of result.screenplayResults) {
        await createArtifact({
          runId,
          stepKey: `screenplay_${screenplayResult.clipId}`,
          artifactType: 'screenplay.clip',
          refId: screenplayResult.clipId,
          payload: {
            ...screenplayResult,
          },
        })
      }

      if (result.summary.screenplayFailedCount > 0) {
        const failed = result.screenplayResults.filter((item) => !item.success)
        const preview = failed
          .slice(0, 3)
          .map((item) => `${item.clipId}:${item.error || 'unknown error'}`)
          .join(' | ')
        throw new Error(
          `STORY_TO_SCRIPT_PARTIAL_FAILED: ${result.summary.screenplayFailedCount}/${result.summary.clipCount} screenplay steps failed. ${preview}`,
        )
      }

      await reportTaskProgress(job, 80, {
        stage: 'story_to_script_persist',
        stageLabel: 'progress.stage.storyToScriptPersist',
        displayMode: 'detail',
      })
      await assertRunActive('story_to_script_persist')

      const episodeStillExists = await prisma.novelPromotionEpisode.findUnique({
        where: { id: episodeId },
        select: { id: true },
      })
      if (!episodeStillExists) {
        throw new Error(`NOT_FOUND: Episode ${episodeId} was deleted while the task was running`)
      }

      const existingCharacterNames = new Set<string>(
        (novelData.characters || []).map((item) => String(item.name || '').toLowerCase()),
      )
      const existingLocationNames = new Set<string>(
        (novelData.locations || [])
          .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) !== 'prop')
          .map((item) => String(item.name || '').toLowerCase()),
      )
      const existingPropNames = new Set<string>(
        (novelData.locations || [])
          .filter((item) => readAssetKind(item as unknown as Record<string, unknown>) === 'prop')
          .map((item) => String(item.name || '').toLowerCase()),
      )

      const persistedResult = await prisma.$transaction(async (tx) => {
        const createdCharacters = await persistAnalyzedCharacters({
          projectInternalId: novelData.id,
          existingNames: existingCharacterNames,
          analyzedCharacters: result.analyzedCharacters,
          db: tx,
        })

        const createdLocations = await persistAnalyzedLocations({
          projectInternalId: novelData.id,
          existingNames: existingLocationNames,
          analyzedLocations: result.analyzedLocations,
          db: tx,
        })
        const createdProps = await persistAnalyzedProps({
          projectInternalId: novelData.id,
          existingNames: existingPropNames,
          analyzedProps: result.analyzedProps,
          db: tx,
        })

        const createdClipRows = await persistClips({
          episodeId,
          clipList: result.clipList,
          db: tx,
        })
        const clipIdMap = new Map(createdClipRows.map((item) => [item.clipKey, item.id]))

        for (const screenplayResult of result.screenplayResults) {
          if (!screenplayResult.success || !screenplayResult.screenplay) continue
          const clipRecordId = resolveClipRecordId(clipIdMap, screenplayResult.clipId)
          if (!clipRecordId) continue
          await tx.novelPromotionClip.update({
            where: { id: clipRecordId },
            data: {
              screenplay: JSON.stringify(screenplayResult.screenplay),
            },
          })
        }

        return {
          createdCharacters,
          createdLocations,
          createdProps,
          createdClipRows,
        }
      })

      await reportTaskProgress(job, 96, {
        stage: 'story_to_script_persist_done',
        stageLabel: 'progress.stage.storyToScriptPersistDone',
        displayMode: 'detail',
      })

      return {
        episodeId,
        clipCount: result.summary.clipCount,
        screenplaySuccessCount: result.summary.screenplaySuccessCount,
        screenplayFailedCount: result.summary.screenplayFailedCount,
        persistedCharacters: persistedResult.createdCharacters.length,
        persistedLocations: persistedResult.createdLocations.length,
        persistedProps: persistedResult.createdProps.length,
        persistedClips: persistedResult.createdClipRows.length,
      }
    },
  })

  if (!leaseResult.claimed || !leaseResult.result) {
    return {
      runId,
      skipped: true,
      episodeId,
    }
  }
  return leaseResult.result
}
