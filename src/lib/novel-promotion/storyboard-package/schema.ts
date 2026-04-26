import { z } from 'zod'
import { SHOT_GROUP_TEMPLATE_REGISTRY } from '@/lib/shot-group/template-registry'

export const STORYBOARD_PACKAGE_SCHEMA = 'waoo.storyboard_package'
export const STORYBOARD_PACKAGE_VERSION = '1.0'

export type StoryboardPackageValidationIssue = {
  code: string
  path: string
  message: string
}

const nonEmptyString = z.string().trim().min(1)
const optionalText = z.string().trim().optional().default('')

export const storyboardPackageTemplateKeySchema = z.enum(['grid-4', 'grid-6', 'grid-9'])
export const storyboardPackageLanguageSchema = z.enum(['zh', 'en', 'ja'])
export const storyboardPackageReferenceModeSchema = z.enum(['omni-reference', 'smart-multi-frame'])

export const storyboardPackageAssetSchema = z.object({
  externalId: nonEmptyString,
  name: nonEmptyString,
  matchName: nonEmptyString.optional(),
  description: z.string().trim().optional(),
}).passthrough()

export const storyboardPackageAssetsSchema = z.object({
  locations: z.array(storyboardPackageAssetSchema).optional().default([]),
  characters: z.array(storyboardPackageAssetSchema).optional().default([]),
  props: z.array(storyboardPackageAssetSchema).optional().default([]),
}).passthrough()

export const storyboardPackageStoryboardModeSchema = z.object({
  id: nonEmptyString,
  label: nonEmptyString,
  promptText: nonEmptyString,
}).passthrough()

export const storyboardPackageReviewConfigSchema = z.object({
  templateKey: storyboardPackageTemplateKeySchema,
  referencePromptText: nonEmptyString,
  storyboardMode: storyboardPackageStoryboardModeSchema,
  compositePromptText: nonEmptyString,
  assets: z.object({
    locationRefs: z.array(nonEmptyString).optional().default([]),
    characterRefs: z.array(nonEmptyString).optional().default([]),
    propRefs: z.array(nonEmptyString).optional().default([]),
  }).passthrough().optional().default({}),
  mood: z.object({
    presetId: z.string().trim().nullable().optional().default(null),
    customMood: z.string().trim().optional().default(''),
  }).passthrough().optional().default({}),
}).passthrough()

export const storyboardPackageVideoConfigSchema = z.object({
  videoPrompt: nonEmptyString,
  dialogueText: optionalText,
  dialogueLanguage: storyboardPackageLanguageSchema,
  includeDialogue: z.boolean(),
  generateAudio: z.boolean(),
  referenceMode: storyboardPackageReferenceModeSchema,
  videoModel: z.string().trim().nullable().optional().default(null),
  generationOptions: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().default({}),
}).passthrough()

export const storyboardPackageShotSchema = z.object({
  shotId: z.string().trim().optional(),
  index: z.number().int().positive(),
  durationSec: z.number().positive().nullable().optional(),
  title: nonEmptyString,
  dramaticBeat: z.string().trim().optional(),
  informationUnit: z.string().trim().optional(),
  purpose: z.string().trim().optional(),
  blocking: z.string().trim().optional(),
  shotSize: z.string().trim().optional(),
  lens: z.string().trim().optional(),
  dof: z.string().trim().optional(),
  angle: z.string().trim().optional(),
  cameraMovement: z.string().trim().optional(),
  composition: z.string().trim().optional(),
  lighting: z.string().trim().optional(),
  edit: z.string().trim().optional(),
  emotionalBeat: z.string().trim().optional(),
  imagePrompt: nonEmptyString,
}).passthrough()

export const storyboardPackageCinematicPlanSchema = z.object({
  emotionalIntent: z.record(z.unknown()).nullable().optional(),
  visualStrategy: z.record(z.unknown()).nullable().optional(),
  shots: z.array(storyboardPackageShotSchema).min(1),
}).passthrough()

export const storyboardPackageSegmentSchema = z.object({
  segmentId: nonEmptyString,
  order: z.number().int().positive(),
  timecode: nonEmptyString,
  targetDurationSec: z.number().positive(),
  title: nonEmptyString,
  sceneLabel: nonEmptyString,
  dramaticFunction: nonEmptyString,
  localOnlyNotice: z.string().trim().optional(),
  informationProgression: z.array(z.string().trim()).optional().default([]),
  reviewConfig: storyboardPackageReviewConfigSchema,
  videoConfig: storyboardPackageVideoConfigSchema,
  cinematicPlan: storyboardPackageCinematicPlanSchema,
}).passthrough()

export const storyboardPackageSceneSchema = z.object({
  sceneId: nonEmptyString,
  title: nonEmptyString,
  targetDurationSec: z.number().positive(),
  directorIntent: nonEmptyString,
  segments: z.array(storyboardPackageSegmentSchema).min(1),
}).passthrough()

export const storyboardPackageGlobalSchema = z.object({
  targetDurationSec: z.number().positive().optional(),
  segmentDurationSec: z.number().positive().optional(),
  defaultTemplateKey: storyboardPackageTemplateKeySchema.optional(),
  defaultStoryboardMode: storyboardPackageStoryboardModeSchema.optional(),
  visualBible: z.record(z.unknown()).optional().default({}),
  continuity: z.record(z.unknown()).optional().default({}),
}).passthrough()

export const storyboardPackageSchema = z.object({
  schema: z.literal(STORYBOARD_PACKAGE_SCHEMA),
  schemaVersion: z.literal(STORYBOARD_PACKAGE_VERSION),
  packageId: nonEmptyString,
  title: nonEmptyString,
  language: storyboardPackageLanguageSchema,
  targetEpisode: z.record(z.unknown()).optional(),
  global: storyboardPackageGlobalSchema,
  assets: storyboardPackageAssetsSchema,
  scenes: z.array(storyboardPackageSceneSchema).min(1),
}).passthrough().superRefine((value, context) => {
  const segmentIds = new Map<string, Array<string | number>>()
  for (const [sceneIndex, scene] of value.scenes.entries()) {
    for (const [segmentIndex, segment] of scene.segments.entries()) {
      const segmentPath = ['scenes', sceneIndex, 'segments', segmentIndex]
      const previousSegmentPath = segmentIds.get(segment.segmentId)
      if (previousSegmentPath) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...segmentPath, 'segmentId'],
          message: `Segment id "${segment.segmentId}" is duplicated; segmentId must be unique within a storyboard package.`,
        })
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...previousSegmentPath, 'segmentId'],
          message: `Segment id "${segment.segmentId}" is duplicated; segmentId must be unique within a storyboard package.`,
        })
      } else {
        segmentIds.set(segment.segmentId, segmentPath)
      }

      if (segment.targetDurationSec > 15) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...segmentPath, 'targetDurationSec'],
          message: 'Segment targetDurationSec must be <= 15 for storyboard package v1.0.',
        })
      }

      const template = SHOT_GROUP_TEMPLATE_REGISTRY[segment.reviewConfig.templateKey]
      const shotCount = segment.cinematicPlan.shots.length
      const shotIndexes = new Set<number>()
      for (const [shotIndex, shot] of segment.cinematicPlan.shots.entries()) {
        if (shotIndexes.has(shot.index)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...segmentPath, 'cinematicPlan', 'shots', shotIndex, 'index'],
            message: `Shot index ${shot.index} is duplicated; shot indexes must be unique within a segment.`,
          })
        }
        shotIndexes.add(shot.index)
      }
      if (shotCount > template.slotCount) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...segmentPath, 'cinematicPlan', 'shots'],
          message: `Shot count ${shotCount} exceeds template ${segment.reviewConfig.templateKey} slot count ${template.slotCount}.`,
        })
      }
    }
  }
})

export type StoryboardPackage = z.infer<typeof storyboardPackageSchema>
export type StoryboardPackageAsset = z.infer<typeof storyboardPackageAssetSchema>
export type StoryboardPackageScene = z.infer<typeof storyboardPackageSceneSchema>
export type StoryboardPackageSegment = z.infer<typeof storyboardPackageSegmentSchema>
export type StoryboardPackageShot = z.infer<typeof storyboardPackageShotSchema>
export type StoryboardPackageTemplateKey = z.infer<typeof storyboardPackageTemplateKeySchema>
export type StoryboardPackageReferenceMode = z.infer<typeof storyboardPackageReferenceModeSchema>

export type StoryboardPackageValidationResult =
  | { success: true; data: StoryboardPackage }
  | { success: false; issues: StoryboardPackageValidationIssue[] }

function formatPath(path: Array<string | number>) {
  return path.length > 0 ? path.map(String).join('.') : '$'
}

export function formatStoryboardPackageValidationIssues(error: z.ZodError): StoryboardPackageValidationIssue[] {
  return error.issues.map((issue) => ({
    code: issue.code,
    path: formatPath(issue.path),
    message: issue.message,
  }))
}

export function validateStoryboardPackage(value: unknown): StoryboardPackageValidationResult {
  const result = storyboardPackageSchema.safeParse(value)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    issues: formatStoryboardPackageValidationIssues(result.error),
  }
}
