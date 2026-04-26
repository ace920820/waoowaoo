# Quick Task 260427-0dt — Seedance 2.0 Content Items Summary

## Result
Implemented configurable multi-shot video reference materials for Ark/Seedance models.

## Changes
- Added `ShotGroupVideoReferenceSettings` with default/normalization helpers.
- Persisted video reference settings in `videoReferencesJson` through shot-group save/update flows.
- Added video-stage UI controls for concept image, character images, scene image, prop images, shot images, and character voice references.
- Built Ark `contentItems` from selected references, capped by Seedance limits of 9 images and 3 audio references.
- Appended `@Image` / `@Audio` usage instructions to the video prompt and stored the actual reference plan in generation snapshots.
- Added worker regression coverage for concept, character, prop, and character audio references.

## Validation
- `npm run typecheck`
- `npx vitest run tests/unit/worker/video-worker.test.ts tests/unit/worker/shot-group-video-config.test.ts tests/unit/novel-promotion/workspace/multi-shot-video-stage.test.ts`
- `npm run lint -- src/lib/shot-group/video-config.ts src/lib/shot-group/video-config-snapshot.ts src/lib/workers/video.worker.ts src/app/api/novel-promotion/[projectId]/shot-groups/route.ts src/app/api/novel-promotion/[projectId]/generate-shot-group-video/route.ts src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx tests/unit/worker/video-worker.test.ts tests/unit/novel-promotion/workspace/multi-shot-video-stage.test.ts`

## Notes
- Reference video upload is not exposed yet; the backend reference plan type leaves room for video references, but this quick task implements the user-prioritized image/audio consistency path.
- Focused lint passed with existing `<img>` warnings in the video-stage component.
