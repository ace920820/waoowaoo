import { parseSceneDetectInput, type SceneDetectProject } from './contracts'

export type SceneDetectResultEnvelope = {
  resultVersion: string
  adapterVersion: string
  executorVersion: string
  analysisId: string
  sourceRevision: number
  operationKey: string
  payload: SceneDetectProject
  provenance?: { mode?: 'executor_result' | 'legacy_json_import'; [key: string]: unknown }
}

export type ParsedSceneDetectResult = {
  project: SceneDetectProject
  provenance: {
    mode: 'executor_result' | 'legacy_json_import'
    resultVersion: string
    adapterVersion: string
    executorVersion: string
    analysisId: string
    sourceRevision: number
    operationKey: string
  }
}

function fail(code: string): never {
  throw new Error(code)
}

function recordOf(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('SCENEDETECT_ENVELOPE_REQUIRED')
  return input as Record<string, unknown>
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) fail(`SCENEDETECT_ENVELOPE_${key.toUpperCase()}_INVALID`)
  return value
}

function requiredPositiveInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) fail(`SCENEDETECT_ENVELOPE_${key.toUpperCase()}_INVALID`)
  return value
}

export function parseSceneDetectResultEnvelope(input: unknown, options: { currentSourceRevision?: number } = {}): ParsedSceneDetectResult {
  const record = recordOf(input)
  if (!('payload' in record)) fail('SCENEDETECT_ENVELOPE_REQUIRED')
  const resultVersion = requiredString(record, 'resultVersion')
  if (!/^1\./.test(resultVersion)) fail('SCENEDETECT_RESULT_VERSION_UNSUPPORTED')
  const adapterVersion = requiredString(record, 'adapterVersion')
  const executorVersion = requiredString(record, 'executorVersion')
  const analysisId = requiredString(record, 'analysisId')
  const operationKey = requiredString(record, 'operationKey')
  const sourceRevision = requiredPositiveInteger(record, 'sourceRevision')
  if (options.currentSourceRevision !== undefined && sourceRevision < options.currentSourceRevision) fail('SCENEDETECT_SOURCE_REVISION_STALE')
  const project = parseSceneDetectInput(record.payload)
  return {
    project,
    provenance: {
      mode: record.provenance && typeof record.provenance === 'object' && (record.provenance as Record<string, unknown>).mode === 'legacy_json_import'
        ? 'legacy_json_import'
        : 'executor_result',
      resultVersion,
      adapterVersion,
      executorVersion,
      analysisId,
      sourceRevision,
      operationKey,
    },
  }
}

export function wrapLegacySceneDetectProject(project: SceneDetectProject, input: { sourceRevision: number; operationKey: string }): SceneDetectResultEnvelope {
  return {
    resultVersion: '1.0',
    adapterVersion: 'legacy_json_import@1.0',
    executorVersion: 'unknown',
    analysisId: project.project.id,
    sourceRevision: input.sourceRevision,
    operationKey: input.operationKey,
    payload: project,
    provenance: { mode: 'legacy_json_import' },
  }
}
