---
status: resolved
trigger: "Video remake storyboard: generated keyframe candidates for shot 04 Middle remain blank after three successful generation attempts"
created: 2026-08-12
updated: 2026-08-12
---

# Debug Session: Remake candidate media missing

## Symptoms

- Expected: after generating the Middle keyframe for shot 04, the candidate thumbnail, selection card, and candidate-dialog main preview display the generated image.
- Actual: generation completes and three candidate batches are shown, but each thumbnail is blank and the candidate dialog says "无图片".
- Errors: no browser-console errors are visible.
- Timeline: this is a new video-remake feature and has never worked. Image generation continues to work on existing multi-shot confirmation and classic project storyboard pages.
- Reproduction: open `/zh/workspace/e44be650-a801-4a76-b7e3-255d018d49b1?stage=storyboard`; choose shot 04, select Middle for generation, click "生成图片", wait for completion, then inspect the card and candidate dialog.

## Current Focus

- hypothesis: confirmed. The worker persisted object-storage keys into `RemakeOutputVersion.mediaId`; the read-side contract expects a registered `MediaObject.id`.
- next_action: monitor the next generated candidate batch; historical candidates are served through the compatibility path.

## Evidence

- Database query for project `e44be650-a801-4a76-b7e3-255d018d49b1`, shot sequence `04`, middle track found four completed candidate output versions. Each `mediaId` is an `images/remake/...jpg` storage key, and no `media_objects` row exists by either the stored ID or storage key.
- `src/lib/workers/handlers/remake-keyframe-image.ts` uploaded candidate images and passed those storage keys directly to `appendKeyframeGenerationBatch`.
- `src/app/api/remake-projects/[projectId]/scenedetect/media/[mediaId]/route.ts` originally resolved output versions only with `getMediaObjectById(mediaId)`, so the legacy storage-key values returned `404`.
- `src/lib/remake-projects/service.ts` projected candidate IDs and eligibility but omitted `mediaId`, `mediaUrl`, and status. The storyboard modal therefore received no image URL and displayed `无图片`.

## Eliminated

## Resolution

- root_cause: keyframe-generation persistence crossed the media boundary incorrectly by storing a raw object-storage key in the output version's `mediaId` field. The snapshot did not serialize candidate media fields, and the route only accepted registered IDs.
- fix: register each newly uploaded candidate with `ensureMediaObjectFromStorageKey` before persistence; persist the returned media IDs; serialize candidate media IDs, opaque route URLs, and status; allow the authenticated project media route to serve pre-fix output versions that store a validated storage key.
- verification:
  - `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/unit/worker/remake-keyframe-image.test.ts` (3 passed; test environment emitted unrelated Redis connection-refused logs after completion)
  - `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/remake-project-core.test.ts -t "projects keyframe candidate"` (1 passed)
  - `BILLING_TEST_BOOTSTRAP=0 npx vitest run tests/integration/api/remake-projects-scenedetect-media.test.ts` (1 passed)
  - `npm run typecheck` (passed)
- files_changed:
  - `src/lib/workers/handlers/remake-keyframe-image.ts`
  - `src/lib/remake-projects/keyframes/service.ts`
  - `src/lib/remake-projects/service.ts`
  - `src/app/api/remake-projects/[projectId]/scenedetect/media/[mediaId]/route.ts`
  - `tests/unit/worker/remake-keyframe-image.test.ts`
  - `tests/integration/api/remake-project-core.test.ts`
  - `tests/integration/api/remake-projects-scenedetect-media.test.ts`
