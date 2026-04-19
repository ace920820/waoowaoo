import type { Job } from 'bullmq'
import { buildCharactersIntroduction } from '@/lib/constants'
import { safeParseJsonArray } from '@/lib/json-repair'
import { logError as _ulogError, logInfo as _ulogInfo } from '@/lib/logging/core'
import { createArtifact } from '@/lib/run-runtime/service'
import { buildPrompt, PROMPT_IDS } from '@/lib/prompt-i18n'
import { reportTaskProgress } from '@/lib/workers/shared'
import { buildEpisodeMultiShotDrafts, type EpisodeMultiShotDraft } from '@/lib/novel-promotion/multi-shot/episode-draft-builder'
import { persistEpisodeMultiShotDrafts } from '@/lib/novel-promotion/multi-shot/persist-drafts'
import type { TaskJobData } from '@/lib/task/types'

type MultiShotRunStep = (meta: {
  stepId: string
  stepTitle: string
  stepIndex: number
  stepTotal: number
  retryable?: boolean
}, prompt: string, action: string, maxOutputTokens: number) => Promise<{
  text: string
  reasoning?: string
}>

type ClipLike = {
  id: string
  content: string
  summary: string | null
  characters: string | null
  location: string | null
  props: string | null
  screenplay: string | null
  shotCount?: number | null
  start?: number | null
  end?: number | null
  duration?: number | null
}

type NovelDataLike = {
  characters: Array<{
    name: string
    description?: string | null
    introduction?: string | null
  }>
  locations: Array<{
    name: string
    summary?: string | null
    assetKind?: string | null
  }>
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function truncateText(value: string | null | undefined, maxLength: number): string {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}...`
}

function splitNameList(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(/[、，,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildRelevantCharacterIntroduction(params: {
  clipCharacters: string | null | undefined
  characters: NovelDataLike['characters']
}) {
  const characterNames = new Set(splitNameList(params.clipCharacters))
  const prioritized = params.characters.filter((item) => characterNames.has(item.name))
  const fallback = prioritized.length > 0 ? prioritized : params.characters.slice(0, 4)
  return truncateText(buildCharactersIntroduction(fallback as never[]), 800) || '暂无角色介绍'
}

function buildRelevantAssetNames(items: string[], maxItems = 6) {
  if (items.length === 0) return '无'
  return items.slice(0, maxItems).join('、')
}

function normalizeExpectedShotCount(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(9, Math.floor(value)))
}

function resolveTemplateKey(expectedShotCount: number): EpisodeMultiShotDraft['templateKey'] {
  if (expectedShotCount <= 4) return 'grid-4'
  if (expectedShotCount <= 6) return 'grid-6'
  return 'grid-9'
}

function readString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key]
  return typeof field === 'string' && field.trim() ? field.trim() : null
}

function readNumber(value: Record<string, unknown>, key: string): number | null {
  const field = value[key]
  return typeof field === 'number' && Number.isFinite(field)
    ? Math.floor(field)
    : null
}

function markDraftGenerationFailed(draft: EpisodeMultiShotDraft): EpisodeMultiShotDraft {
  return {
    ...draft,
    sourceStatus: 'placeholder',
    placeholderReason: 'generation_failed',
    narrativePrompt: null,
    embeddedDialogue: null,
    shotRhythmGuidance: null,
    groupPrompt: null,
    videoPrompt: null,
    includeDialogue: false,
  }
}

function buildClipGenerationPrompt(params: {
  clip: ClipLike
  clipIndex: number
  totalClipCount: number
  segmentDefaults: EpisodeMultiShotDraft[]
  novelData: NovelDataLike
  locale: 'zh' | 'en'
}) {
  const expectedShotCount = Math.max(
    ...params.segmentDefaults.map((item) => item.expectedShotCount),
    4,
  )
  const sceneLabel = params.segmentDefaults[0]?.sceneLabel || normalizeText(params.clip.location) || '待补充场景'
  const segmentWindowSummary = params.segmentDefaults
    .map((item) => `子片段${item.segmentIndexWithinClip}: ${item.segmentStartSeconds}-${item.segmentEndSeconds}s`)
    .join('\n')

  return buildPrompt({
    promptId: PROMPT_IDS.NP_MULTI_SHOT_SEGMENTATION,
    locale: params.locale,
    variables: {
      clip_index: String(params.clipIndex + 1),
      total_clip_count: String(params.totalClipCount),
      segment_count: String(params.segmentDefaults.length),
      expected_shot_count: String(expectedShotCount),
      scene_label: sceneLabel,
      clip_summary: truncateText(params.clip.summary, 600) || '无',
      clip_content: truncateText(params.clip.content, 1800) || '无',
      screenplay_json: truncateText(params.clip.screenplay, 2200) || '无',
      clip_characters: truncateText(params.clip.characters, 120) || '无',
      clip_location: truncateText(params.clip.location, 120) || '无',
      clip_props: truncateText(params.clip.props, 120) || '无',
      segment_windows: segmentWindowSummary || '无',
      characters_lib_name: buildRelevantAssetNames(params.novelData.characters.map((item) => item.name)),
      characters_introduction: buildRelevantCharacterIntroduction({
        clipCharacters: params.clip.characters,
        characters: params.novelData.characters,
      }),
      locations_lib_name: buildRelevantAssetNames(params.novelData.locations
        .filter((item) => item.assetKind !== 'prop')
        .map((item) => item.name)
      ),
      props_lib_name: buildRelevantAssetNames(params.novelData.locations
        .filter((item) => item.assetKind === 'prop')
        .map((item) => item.name)
      ),
    },
  })
}

function mergeClipSegments(params: {
  segmentDefaults: EpisodeMultiShotDraft[]
  generatedRows: Array<Record<string, unknown>>
}) {
  const rowsByIndex = new Map<number, Record<string, unknown>>()
  for (const row of params.generatedRows) {
    const index = readNumber(row, 'segmentIndexWithinClip')
      || readNumber(row, 'segment_index_within_clip')
    if (!index) continue
    rowsByIndex.set(index, row)
  }

  return params.segmentDefaults.map((draft) => {
    const row = rowsByIndex.get(draft.segmentIndexWithinClip)
    if (!row) {
      return markDraftGenerationFailed(draft)
    }

    const title = readString(row, 'title') || draft.title
    const sceneLabel = readString(row, 'sceneLabel') || readString(row, 'scene_label') || draft.sceneLabel
    const narrativePrompt = readString(row, 'narrativePrompt') || readString(row, 'narrative_prompt')
    const embeddedDialogue = readString(row, 'embeddedDialogue') || readString(row, 'embedded_dialogue')
    const shotRhythmGuidance = readString(row, 'shotRhythmGuidance') || readString(row, 'shot_rhythm_guidance')

    if (!narrativePrompt || !shotRhythmGuidance) {
      return markDraftGenerationFailed(draft)
    }

    const expectedShotCount = normalizeExpectedShotCount(
      row.expectedShotCount ?? row.expected_shot_count,
      draft.expectedShotCount,
    )

    return {
      ...draft,
      title,
      sceneLabel,
      expectedShotCount,
      templateKey: resolveTemplateKey(expectedShotCount),
      narrativePrompt,
      embeddedDialogue,
      shotRhythmGuidance,
      groupPrompt: narrativePrompt,
      videoPrompt: narrativePrompt,
      includeDialogue: Boolean(embeddedDialogue),
      sourceStatus: 'ready' as const,
      placeholderReason: null,
    }
  })
}

export async function handleMultiShotScriptToStoryboardTask(params: {
  job: Job<TaskJobData>
  runId: string
  episodeId: string
  locale: 'zh' | 'en'
  clips: ClipLike[]
  novelData: NovelDataLike
  runStep: MultiShotRunStep
  assertRunActive: (stage: string) => Promise<void>
}) {
  const defaultDrafts = buildEpisodeMultiShotDrafts({
    episodeId: params.episodeId,
    clips: params.clips as never[],
  })
  const defaultsByClipId = new Map<string, EpisodeMultiShotDraft[]>()
  for (const draft of defaultDrafts) {
    const group = defaultsByClipId.get(draft.sourceClipId) || []
    group.push(draft)
    defaultsByClipId.set(draft.sourceClipId, group)
  }

  const generatedDrafts: EpisodeMultiShotDraft[] = []
  let panelCount = 0
  const totalSteps = params.clips.length

  for (let index = 0; index < params.clips.length; index += 1) {
    const clip = params.clips[index]
    const segmentDefaults = defaultsByClipId.get(clip.id) || []
    panelCount += segmentDefaults.length
    _ulogInfo('[MultiShotStoryboard] clip processing started', {
      runId: params.runId,
      episodeId: params.episodeId,
      clipId: clip.id,
      clipIndex: index + 1,
      totalClips: params.clips.length,
      segmentDefaultCount: segmentDefaults.length,
    })

    if (segmentDefaults.length === 0) continue

    if (segmentDefaults.every((item) => item.sourceStatus === 'placeholder')) {
      _ulogInfo('[MultiShotStoryboard] clip defaults already placeholder', {
        runId: params.runId,
        clipId: clip.id,
      })
      generatedDrafts.push(...segmentDefaults)
      continue
    }

    const prompt = buildClipGenerationPrompt({
      clip,
      clipIndex: index,
      totalClipCount: params.clips.length,
      segmentDefaults,
      novelData: params.novelData,
      locale: params.locale,
    })

    try {
      const output = await params.runStep({
        stepId: `multi_shot_clip_${clip.id}`,
        stepTitle: `多镜头片段拆解 ${index + 1}/${totalSteps}`,
        stepIndex: index + 1,
        stepTotal: totalSteps,
        retryable: true,
      }, prompt, 'multi_shot_storyboard', 3600)
      const generatedRows = safeParseJsonArray(output.text, 'segments')
      _ulogInfo('[MultiShotStoryboard] clip generation completed', {
        runId: params.runId,
        clipId: clip.id,
        generatedRowCount: generatedRows.length,
      })
      const merged = mergeClipSegments({
        segmentDefaults,
        generatedRows,
      })
      _ulogInfo('[MultiShotStoryboard] clip merge completed', {
        runId: params.runId,
        clipId: clip.id,
        mergedCount: merged.length,
        placeholderCount: merged.filter((item) => item.sourceStatus === 'placeholder').length,
      })
      generatedDrafts.push(...merged)

      await createArtifact({
        runId: params.runId,
        stepKey: `multi_shot_clip_${clip.id}`,
        artifactType: 'multi-shot.clip.segments',
        refId: clip.id,
        payload: {
          clipId: clip.id,
          segments: merged,
        },
      })
    } catch (error) {
      _ulogError('[MultiShotStoryboard] clip generation failed', {
        runId: params.runId,
        clipId: clip.id,
        message: error instanceof Error ? error.message : String(error),
      })
      generatedDrafts.push(...segmentDefaults.map(markDraftGenerationFailed))
    }
  }

  await reportTaskProgress(params.job, 80, {
    stage: 'script_to_storyboard_persist',
    stageLabel: 'progress.stage.scriptToStoryboardPersist',
    displayMode: 'detail',
  })
  await params.assertRunActive('multi_shot_storyboard_persist')
  _ulogInfo('[MultiShotStoryboard] persisting drafts', {
    runId: params.runId,
    episodeId: params.episodeId,
    generatedDraftCount: generatedDrafts.length,
    placeholderCount: generatedDrafts.filter((item) => item.sourceStatus === 'placeholder').length,
  })

  const persisted = await persistEpisodeMultiShotDrafts({
    episodeId: params.episodeId,
    drafts: generatedDrafts,
  })
  _ulogInfo('[MultiShotStoryboard] persisted drafts', {
    runId: params.runId,
    episodeId: params.episodeId,
    shotGroupCount: persisted.shotGroups.length,
    summary: persisted.summary,
  })

  await createArtifact({
    runId: params.runId,
    stepKey: 'multi_shot_storyboard_result',
    artifactType: 'multi-shot.episode.segments',
    refId: params.episodeId,
    payload: {
      segments: generatedDrafts,
      summary: persisted.summary,
    },
  })

  await reportTaskProgress(params.job, 96, {
    stage: 'script_to_storyboard_persist_done',
    stageLabel: 'progress.stage.scriptToStoryboardPersistDone',
    displayMode: 'detail',
  })

  return {
    episodeId: params.episodeId,
    shotGroupCount: persisted.shotGroups.length,
    panelCount,
    placeholderCount: persisted.summary.placeholderCount,
  }
}
