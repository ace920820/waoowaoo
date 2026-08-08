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
  return value.trim()
}

function requiredPositiveInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) fail(`SCENEDETECT_ENVELOPE_${key.toUpperCase()}_INVALID`)
  return value
}

function assertVersion(value: string, kind: 'RESULT' | 'ADAPTER' | 'EXECUTOR') {
  const pattern = kind === 'RESULT'
    ? /^(\d+)\.\d+(?:\.\d+)?$/
    : kind === 'ADAPTER'
      ? /^scenedetect-adapter@(\d+)\.\d+(?:\.\d+)?$/
      : /^scenedetect-executor@(\d+)\.\d+(?:\.\d+)?$/
  const match = value.match(pattern)
  if (!match) fail(`SCENEDETECT_${kind}_VERSION_INVALID`)
  if (match[1] !== '1') fail(`SCENEDETECT_${kind}_VERSION_UNSUPPORTED`)
}

export function parseSceneDetectResultEnvelope(
  input: unknown,
  options: { currentSourceRevision?: number; allowLegacyImport?: boolean } = {},
): ParsedSceneDetectResult {
  const record = recordOf(input)
  if (!('payload' in record)) fail('SCENEDETECT_ENVELOPE_REQUIRED')
  const resultVersion = requiredString(record, 'resultVersion')
  assertVersion(resultVersion, 'RESULT')
  const provenanceMode = record.provenance && typeof record.provenance === 'object'
    ? (record.provenance as Record<string, unknown>).mode
    : undefined
  if (provenanceMode === 'legacy_json_import' && !options.allowLegacyImport) fail('SCENEDETECT_LEGACY_IMPORT_WRAPPER_REQUIRED')
  if (provenanceMode !== undefined && provenanceMode !== 'legacy_json_import' && provenanceMode !== 'executor_result') {
    fail('SCENEDETECT_ENVELOPE_PROVENANCE_INVALID')
  }
  const adapterVersion = requiredString(record, 'adapterVersion')
  if (provenanceMode === 'legacy_json_import') {
    if (adapterVersion !== 'legacy_json_import@1.0') fail('SCENEDETECT_LEGACY_IMPORT_WRAPPER_REQUIRED')
  } else {
    assertVersion(adapterVersion, 'ADAPTER')
  }
  const executorVersion = requiredString(record, 'executorVersion')
  if (executorVersion !== 'unknown') assertVersion(executorVersion, 'EXECUTOR')
  const analysisId = requiredString(record, 'analysisId')
  const operationKey = requiredString(record, 'operationKey')
  const sourceRevision = requiredPositiveInteger(record, 'sourceRevision')
  if (options.currentSourceRevision !== undefined && sourceRevision < options.currentSourceRevision) fail('SCENEDETECT_SOURCE_REVISION_STALE')
  if (options.currentSourceRevision !== undefined && sourceRevision > options.currentSourceRevision) fail('SCENEDETECT_SOURCE_REVISION_MISMATCH')
  const project = parseSceneDetectInput(record.payload)
  return {
    project,
    provenance: {
      mode: provenanceMode === 'legacy_json_import'
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
    provenance: { mode: 'legacy_json_import', operationKey: input.operationKey },
  }
}

export function parseLegacySceneDetectProject(project: SceneDetectProject, input: { sourceRevision: number; operationKey: string }): ParsedSceneDetectResult {
  return parseSceneDetectResultEnvelope(wrapLegacySceneDetectProject(project, input), { allowLegacyImport: true })
}
