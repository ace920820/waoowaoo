# Stack

## Summary

`waoowaoo` is a TypeScript-heavy full-stack Next.js application for AI-assisted short-drama / comic-video production. The primary runtime is a web app plus background workers, with MySQL for persistence, Redis/BullMQ for async execution, and MinIO-compatible object storage for media.

## Core Runtime

- Language: TypeScript with some shell and small utility Python scripts
- Node runtime: `>=18.18.0` from [package.json](/Users/jamiezhao/projects/waoowaoo/package.json)
- Package manager: npm with `package-lock.json`
- Framework: Next.js 15 App Router + React 19 in [package.json](/Users/jamiezhao/projects/waoowaoo/package.json)
- Server rendering / routing: `src/app/` with locale-aware pages and route handlers
- Legacy Next surface: `src/pages/_document.tsx`

## Application Processes

- Web app: `npm run dev:next` / `npm run start:next`
- Worker process: `src/lib/workers/index.ts`
- Watchdog process: `scripts/watchdog.ts`
- Bull Board process: `scripts/bull-board.ts`
- Combined local dev entrypoint: `npm run dev`
- Combined production-like entrypoint: `npm run start`

## Frontend Stack

- React 19 and React DOM
- Next.js App Router pages under `src/app/[locale]/...`
- `next-intl` middleware and routing in `middleware.ts`, `src/i18n/routing.ts`, and `src/i18n/navigation.ts`
- Tailwind CSS v4 via `@tailwindcss/postcss` and `postcss.config.mjs`
- React Query for client data orchestration in `src/lib/query/`
- Remotion player/editor support in `src/features/video-editor/` and `src/features/video-editor/remotion/`

## Backend / Server Stack

- Prisma ORM with MySQL datasource in [prisma/schema.prisma](/Users/jamiezhao/projects/waoowaoo/prisma/schema.prisma)
- NextAuth credentials auth in [src/lib/auth.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/auth.ts)
- BullMQ queues in [src/lib/task/queues.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/task/queues.ts)
- Redis clients in [src/lib/redis.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/redis.ts)
- Internal workflow/run runtime in `src/lib/run-runtime/` and `src/lib/workflow-engine/`
- Structured logging in `src/lib/logging/`

## AI / Media Stack

- AI SDKs: `ai`, `@ai-sdk/openai`, `@ai-sdk/google`, `openai`, `@google/genai`
- Provider-specific modules in `src/lib/providers/bailian/`, `src/lib/providers/siliconflow/`, and `src/lib/providers/official/`
- Compatibility gateway in `src/lib/model-gateway/` and `src/lib/model-gateway/openai-compat/`
- Media processing with `sharp`, `archiver`, `jszip`, and internal helpers in `src/lib/media/`
- Video composition and preview via Remotion packages

## Storage / Infra

- Database: MySQL 8 via Docker in [docker-compose.yml](/Users/jamiezhao/projects/waoowaoo/docker-compose.yml)
- Queue/cache: Redis 7 via Docker in [docker-compose.yml](/Users/jamiezhao/projects/waoowaoo/docker-compose.yml)
- Object storage: MinIO by default; local and COS provider abstractions exist in `src/lib/storage/providers/`
- Storage provider factory in [src/lib/storage/factory.ts](/Users/jamiezhao/projects/waoowaoo/src/lib/storage/factory.ts)
- Internal file serving and media signing endpoints under `src/app/api/files/` and `src/app/api/storage/`

## Configuration Surface

- Main app config: [next.config.ts](/Users/jamiezhao/projects/waoowaoo/next.config.ts)
- TypeScript config: [tsconfig.json](/Users/jamiezhao/projects/waoowaoo/tsconfig.json)
- Environment template: [.env.example](/Users/jamiezhao/projects/waoowaoo/.env.example)
- Docker orchestration: [docker-compose.yml](/Users/jamiezhao/projects/waoowaoo/docker-compose.yml)
- HTTPS local reverse proxy option: [Caddyfile](/Users/jamiezhao/projects/waoowaoo/caddyfile)

## Notable Characteristics

- Repo is large and app-heavy: `src/lib` and `src/app` dominate file count
- API surface is broad: about 147 `route.ts` handlers under `src/app/api`
- Test surface is broad: about 291 `*.test.ts` files under `tests/` and `src/lib/**`
- Strict local gates are emphasized through Husky hooks and many custom guard scripts
