import { z } from 'zod'

export const IMAGE_PROMPT_TARGET_KEYS = ['image:start', 'image:middle', 'image:end'] as const
export const promptTargetKeySchema = z.enum([...IMAGE_PROMPT_TARGET_KEYS, 'video'])
export type PromptTargetKey = z.infer<typeof promptTargetKeySchema>

const stringListSchema = z.array(z.string().min(1))
const text = z.string().min(1)

const cameraAndCompositionSchema = z.object({
  aspectRatio: text, cameraPositionAndAngle: text, lensAndFieldOfView: text, focalLengthRange: text,
  shotScale: text, subjectLayout: text, subjectOccupancy: text, spatialRelations: text, perspectiveAndVisualFlow: text,
}).strict()
const depthAndImagingSchema = z.object({
  depthOfField: text, focusPlane: text, sharpnessDistribution: text, motionAndLensEffects: text, exposureRecommendations: text,
}).strict()
const subjectSchema = z.object({
  label: text, category: text, positionAndScale: text, appearance: text, materials: text, wardrobeAndEquipment: text,
  actionAndPose: text, orientationAndGaze: text, occlusionAndCrop: text, relations: text, lighting: text,
}).strict()
const sceneAndSpaceSchema = z.object({
  setting: text, atmosphereMedium: text, foreground: text, midground: text, background: text, visibilityAndDepth: text, narrativePressure: text,
}).strict()
const lightingSchema = z.object({
  keyLight: text, qualityAndFalloff: text, fillLight: text, rimAndReflectedLight: text, emissiveEffects: text, volumetricsAndOcclusion: text, highlightsAndShadows: text,
}).strict()
const colorAndStyleSchema = z.object({
  temperatureAndTone: text, paletteRelationships: text, saturationBrightnessContrast: text, whiteBalanceAndExposure: text, mediumAndTexture: text, postProcessing: text,
}).strict()

export const imagePromptAnalysisSchema = z.object({
  analysisBasis: z.object({
    visibleFacts: stringListSchema,
    photographicInferences: stringListSchema,
    generationRecommendations: stringListSchema,
  }).strict(),
  structuredPrompt: z.object({
    cameraAndComposition: cameraAndCompositionSchema,
    depthAndImaging: depthAndImagingSchema,
    subjects: z.array(subjectSchema),
    sceneAndSpace: sceneAndSpaceSchema,
    lighting: lightingSchema,
    colorAndStyle: colorAndStyleSchema,
  }).strict(),
  integratedGenerationPrompt: z.string().min(1),
  negativeConstraints: stringListSchema,
  pendingQuestions: stringListSchema,
}).strict()
export type ImagePromptAnalysis = z.infer<typeof imagePromptAnalysisSchema>

export const videoPromptAnalysisSchema = z.object({
  coreEvent: z.string().min(1),
  actions: stringListSchema,
  interactions: stringListSchema,
  directions: stringListSchema,
  blocking: z.string().min(1),
  shotScale: z.string().min(1),
  camera: z.string().min(1),
  movement: z.string().min(1),
  rhythm: z.string().min(1),
  environmentChange: z.string().min(1),
  temporalProgression: z.string().min(1),
}).strict()
export type VideoPromptAnalysis = z.infer<typeof videoPromptAnalysisSchema>

export const promptInputSnapshotSchema = z.object({
  projectId: z.string().uuid(),
  remakeProjectId: z.string().uuid(),
  shotId: z.string().uuid(),
  stableKey: z.string().min(1),
  sourceRevision: z.number().int().positive(),
  shotRevision: z.number().int().positive(),
  shotRevisionId: z.string().uuid(),
  keyframeMediaRefs: z.record(z.string()).default({}),
}).strict()
export type PromptInputSnapshot = z.infer<typeof promptInputSnapshotSchema>

export const promptProvenanceSchema = z.object({
  taskId: z.string().uuid().nullable().optional(),
  skillVersion: z.string().min(1).nullable().optional(),
  schemaVersion: z.string().min(1).nullable().optional(),
  modelVersion: z.string().min(1).nullable().optional(),
  executorVersion: z.string().min(1).nullable().optional(),
}).strict()
export type PromptProvenance = z.infer<typeof promptProvenanceSchema>

export function parsePromptAnalysis(targetKey: PromptTargetKey, value: unknown) {
  return targetKey === 'video' ? videoPromptAnalysisSchema.parse(value) : imagePromptAnalysisSchema.parse(value)
}
