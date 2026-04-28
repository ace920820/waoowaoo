import type { GenerateResult } from '@/lib/generators/base'
import type { OpenAICompatImageRequest } from '../types'
import {
  buildRenderedTemplateRequest,
  buildTemplateVariables,
  extractTemplateError,
  normalizeResponseJson,
  readJsonPath,
} from '@/lib/openai-compat-template-runtime'
import { parseModelKeyStrict } from '@/lib/model-config-contract'
import { resolveOpenAICompatClientConfig } from './common'
import { resolveOpenAICompatImageModelAlias } from './image-model-alias'

const OPENAI_COMPAT_PROVIDER_PREFIX = 'openai-compatible:'
const PROVIDER_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function encodeProviderToken(providerId: string): string {
  const value = providerId.trim()
  if (value.startsWith(OPENAI_COMPAT_PROVIDER_PREFIX)) {
    const uuid = value.slice(OPENAI_COMPAT_PROVIDER_PREFIX.length).trim()
    if (PROVIDER_UUID_PATTERN.test(uuid)) {
      return `u_${uuid.toLowerCase()}`
    }
  }
  return `b64_${Buffer.from(value, 'utf8').toString('base64url')}`
}

function encodeModelRef(modelRef: string): string {
  return Buffer.from(modelRef, 'utf8').toString('base64url')
}

function resolveModelRef(request: OpenAICompatImageRequest): string {
  const modelId = typeof request.modelId === 'string' ? request.modelId.trim() : ''
  if (modelId) return modelId
  const parsed = typeof request.modelKey === 'string' ? parseModelKeyStrict(request.modelKey) : null
  if (parsed?.modelId) return parsed.modelId
  throw new Error('OPENAI_COMPAT_IMAGE_MODEL_REF_REQUIRED')
}

function readTemplateImagePayloads(value: unknown): { urls: string[]; b64Json: string | null } {
  if (!Array.isArray(value)) return { urls: [], b64Json: null }
  const urls: string[] = []
  let b64Json: string | null = null
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      urls.push(item.trim())
      continue
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const url = (item as { url?: unknown }).url
    if (typeof url === 'string' && url.trim()) {
      urls.push(url.trim())
    }
    const rawB64 = (item as { b64_json?: unknown }).b64_json
    if (b64Json === null && typeof rawB64 === 'string' && rawB64.trim()) {
      b64Json = rawB64.trim()
    }
  }
  return { urls, b64Json }
}

function toImageBase64Result(imageBase64: string): GenerateResult {
  return {
    success: true,
    imageBase64,
    imageUrl: `data:image/png;base64,${imageBase64}`,
  }
}

export async function generateImageViaOpenAICompatTemplate(
  request: OpenAICompatImageRequest,
): Promise<GenerateResult> {
  if (!request.template) {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_REQUIRED')
  }
  if (request.template.mediaType !== 'image') {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_MEDIA_TYPE_INVALID')
  }

  const config = await resolveOpenAICompatClientConfig(request.userId, request.providerId)
  const firstReference = Array.isArray(request.referenceImages) && request.referenceImages.length > 0
    ? request.referenceImages[0]
    : ''
  const alias = resolveOpenAICompatImageModelAlias(request.modelId)
  const templateOptions = alias.quality
    ? { ...request.options, quality: alias.quality }
    : request.options
  const variables = buildTemplateVariables({
    model: alias.modelId || request.modelId || 'gpt-image-1',
    prompt: request.prompt,
    image: firstReference,
    images: request.referenceImages || [],
    aspectRatio: typeof templateOptions?.aspectRatio === 'string' ? templateOptions.aspectRatio : undefined,
    resolution: typeof templateOptions?.resolution === 'string' ? templateOptions.resolution : undefined,
    size: typeof templateOptions?.size === 'string' ? templateOptions.size : undefined,
    extra: templateOptions,
  })

  const createRequest = await buildRenderedTemplateRequest({
    baseUrl: config.baseUrl,
    endpoint: request.template.create,
    variables,
    defaultAuthHeader: `Bearer ${config.apiKey}`,
  })
  if (['POST', 'PUT', 'PATCH'].includes(createRequest.method) && !createRequest.body) {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_CREATE_BODY_REQUIRED')
  }
  const response = await fetch(createRequest.endpointUrl, {
    method: createRequest.method,
    headers: createRequest.headers,
    ...(createRequest.body ? { body: createRequest.body } : {}),
  })
  const rawText = await response.text().catch(() => '')
  const payload = normalizeResponseJson(rawText)
  if (!response.ok) {
    throw new Error(extractTemplateError(request.template, payload, response.status))
  }

  if (request.template.mode === 'sync') {
    const outputPayloads = readTemplateImagePayloads(
      readJsonPath(payload, request.template.response.outputUrlsPath),
    )
    const outputUrls = outputPayloads.urls
    if (outputUrls.length > 0) {
      const first = outputUrls[0]
      return {
        success: true,
        imageUrl: first,
        ...(outputUrls.length > 1 ? { imageUrls: outputUrls } : {}),
      }
    }

    const outputUrl = readJsonPath(payload, request.template.response.outputUrlPath)
    if (typeof outputUrl === 'string' && outputUrl.trim().length > 0) {
      return {
        success: true,
        imageUrl: outputUrl.trim(),
      }
    }
    if (outputPayloads.b64Json) {
      return toImageBase64Result(outputPayloads.b64Json)
    }
    const outputBase64 = readJsonPath(payload, '$.data[0].b64_json')
    if (typeof outputBase64 === 'string' && outputBase64.trim().length > 0) {
      return toImageBase64Result(outputBase64.trim())
    }
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_OUTPUT_NOT_FOUND')
  }

  const taskIdRaw = readJsonPath(payload, request.template.response.taskIdPath)
  const taskId = typeof taskIdRaw === 'string' ? taskIdRaw.trim() : ''
  if (!taskId) {
    throw new Error('OPENAI_COMPAT_IMAGE_TEMPLATE_TASK_ID_NOT_FOUND')
  }
  const providerToken = encodeProviderToken(config.providerId)
  const modelRefToken = encodeModelRef(resolveModelRef(request))
  return {
    success: true,
    async: true,
    requestId: taskId,
    externalId: `OCOMPAT:IMAGE:${providerToken}:${modelRefToken}:${taskId}`,
  }
}
