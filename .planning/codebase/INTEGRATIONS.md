# Integrations

## Summary

The codebase integrates with multiple classes of external systems: model providers, object storage, database and queue infrastructure, auth/session handling, and deployment/build infrastructure. A notable project pattern is routing provider access through a configuration center and model gateway instead of allowing direct ad hoc calls.

## Databases And State Stores

- MySQL through Prisma in [prisma/schema.prisma](/Users/jamiezhao/projects/waoowaoo/prisma/schema.prisma)
- Redis through `ioredis` in [src/lib/redis.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/redis.ts)
- BullMQ queues on top of Redis in [src/lib/task/queues.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/task/queues.ts)

## Object Storage

- MinIO-compatible S3 storage is the default from [.env.example](/Users/jamiezhao/projects/waoowaoo/.env.example)
- Local development storage exists via `src/lib/storage/providers/local.ts`
- Tencent COS support is wired in factory/config, with provider implementation in `src/lib/storage/providers/cos.ts`
- Signed URL and file-serving flows appear in:
  - `src/app/api/storage/sign/route.ts`
  - `src/app/api/files/[...path]/route.ts`
  - `src/app/api/cos/image/route.ts`

## Authentication

- NextAuth credentials flow in [src/lib/auth.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/auth.ts)
- Prisma adapter integration with user/account/session models
- Auth endpoints under `src/app/api/auth/[...nextauth]/route.ts` and `src/app/api/auth/register/route.ts`

## AI Provider Ecosystem

- OpenAI-family and compatible providers mediated through:
  - `src/lib/api-config.ts`
  - `src/lib/model-gateway/router.ts`
  - `src/lib/model-gateway/openai-compat/`
- Provider-specific modules exist for:
  - Bailian: `src/lib/providers/bailian/`
  - SiliconFlow: `src/lib/providers/siliconflow/`
  - Official provider registry: `src/lib/providers/official/model-registry.ts`
- SDK dependencies also indicate Google GenAI, OpenRouter, FAL, and OpenAI integrations in [package.json](/Users/jamiezhao/projects/waoowaoo/package.json)

## User Model Configuration

- User-facing model setup and API configuration routes:
  - `src/app/api/user/api-config/route.ts`
  - `src/app/api/user/models/route.ts`
  - `src/app/api/user-preference/route.ts`
- Config-center rule set is documented directly in [src/lib/api-config.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/api-config.ts)
- Important invariant: model identity is `provider::modelId`, with explicit guards against provider guessing and silent fallback

## Task / Streaming / Runtime Integrations

- SSE endpoint in `src/app/api/sse/route.ts`
- Run APIs in `src/app/api/runs/`
- Task APIs in `src/app/api/tasks/` and `src/app/api/task-target-states/route.ts`
- Runtime bridge between task events and run events in `src/lib/run-runtime/task-bridge.ts`

## Media And Creative Workflow Endpoints

- Novel-promotion routes under `src/app/api/novel-promotion/[projectId]/...`
- Asset Hub routes under `src/app/api/asset-hub/...`
- Project routes under `src/app/api/projects/` and `src/app/api/assets/`
- Admin log download route in `src/app/api/admin/download-logs/route.ts`

## Deployment / Delivery

- Docker image publish pipeline in [.github/workflows/docker-publish.yml](/Users/jamiezhao/projects/waoowaoo/.github/workflows/docker-publish.yml)
- Containerized runtime defined in [docker-compose.yml](/Users/jamiezhao/projects/waoowaoo/docker-compose.yml)
- Optional Caddy-based HTTPS local proxy via [Caddyfile](/Users/jamiezhao/projects/waoowaoo/Caddyfile)

## Secrets / Sensitive Config Touchpoints

- `.env` expects DB, Redis, storage, auth, cron, and internal task tokens
- `API_ENCRYPTION_KEY` is used for stored provider secret handling
- Logging is configured to redact common secret keys via `LOG_REDACT_KEYS`
- Generated codebase docs should avoid copying literal secret values even though example defaults are present in tracked templates
