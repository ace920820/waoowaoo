---
phase: 03-editable-production-handoff
reviewed: 2026-04-19T15:25:38Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - src/lib/shot-group/draft-metadata.ts
  - src/app/api/novel-promotion/[projectId]/shot-groups/route.ts
  - src/app/api/novel-promotion/[projectId]/multi-shot-drafts/route.ts
  - src/lib/novel-promotion/multi-shot/persist-drafts.ts
  - src/lib/shot-group/prompt.ts
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/MultiShotStoryboardStage.tsx
  - src/lib/novel-promotion/stages/video-stage-runtime-core.tsx
  - src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/VideoRenderPanel.tsx
  - tests/unit/novel-promotion/multi-shot/shot-group-editable-dialogue.test.ts
  - tests/unit/novel-promotion/workspace/multi-shot-video-stage.test.ts
  - tests/unit/novel-promotion/workspace/multi-shot-stage-routing.test.ts
  - tests/unit/novel-promotion/workspace/multi-shot-storyboard-stage.test.ts
  - tests/unit/novel-promotion/video-stage-runtime-regressions.test.ts
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-04-19T15:25:38Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

The editable production handoff flow is broadly coherent, and the targeted Phase 03 unit suites passed locally. The main regressions are around state preservation: the multi-shot draft preparation API and both local handoff editors can discard previously entered editable metadata during normal refresh/rebuild paths.

Targeted verification run:

```text
npx vitest run tests/unit/novel-promotion/multi-shot/shot-group-editable-dialogue.test.ts tests/unit/novel-promotion/workspace/multi-shot-video-stage.test.ts tests/unit/novel-promotion/workspace/multi-shot-stage-routing.test.ts tests/unit/novel-promotion/workspace/multi-shot-storyboard-stage.test.ts tests/unit/novel-promotion/video-stage-runtime-regressions.test.ts
```

All 5 files passed, 29 tests total.

## Warnings

### WR-01: Rebuilding multi-shot drafts wipes saved editable metadata

**File:** `src/app/api/novel-promotion/[projectId]/multi-shot-drafts/route.ts:136-198`
**Issue:** When an existing shot group is matched, the route rebuilds `videoReferencesJson` from fresh derived draft data and hard-resets `dialogueOverrideText` to `null`, without loading or merging `previousDraftMetadata`. That drops saved review-stage edits such as dialogue overrides, asset bindings, custom prompts, storyboard mode, and mood settings whenever the user re-runs draft preparation. `src/lib/novel-promotion/multi-shot/persist-drafts.ts` already preserves these fields, so the route has diverged into a data-loss path.
**Fix:**
```ts
const previousDraftMetadata = existing
  ? parseShotGroupDraftMetadata(existing.videoReferencesJson)
  : null

const videoReferencesJson = buildShotGroupVideoConfigSnapshot({
  generateAudio: false,
  includeDialogue: draft.includeDialogue,
  dialogueLanguage: 'zh',
  omniReferenceEnabled: false,
  smartMultiFrameEnabled: true,
  generationOptions: {},
  previousDraftMetadata,
  draftMetadata: {
    ...derivedDraftMetadata,
    dialogueOverrideText: previousDraftMetadata?.dialogueOverrideText ?? null,
    selectedLocationAsset: previousDraftMetadata?.selectedLocationAsset ?? null,
    // preserve the rest of the editable review fields here
  },
})
```

### WR-02: Review-mode form state is overwritten by any shot-group refresh

**File:** `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx:376-401`
**Issue:** `syncReviewDraftsFromShotGroups()` replaces the local review draft with the server-seeded draft whenever they differ. That means unsaved edits to reference prompts, composite prompts, selected assets, storyboard mode, or mood are discarded on the next `shotGroups` prop refresh, even if the refresh contains the same server data. The effect at `:505-507` applies this on every visible shot-group update.
**Fix:**
```ts
// Keep local draft unless the server version actually changed or the group is new.
const resolvedDraft = previousDraft ?? seededDraft

// Better: track dirty state / last-synced snapshot per group and only reseed
// when the incoming server payload differs from the last-saved version.
```

### WR-03: Video-mode editable fields are also clobbered by refreshes

**File:** `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/video-stage/ShotGroupVideoSection.tsx:1506-1533`
**Issue:** The video-stage draft sync effect always copies server values back into `title`, `groupPrompt`, `videoPrompt`, and `dialogueText` for existing groups. Any background invalidation or refetch can therefore erase in-progress edits before the user clicks save. This is the same class of regression as WR-02, but it affects the production handoff fields used immediately before video submission.
**Fix:**
```ts
next[group.id] = existing
  ? {
      ...existing,
      // only replace fields that were not edited locally, or after an explicit save
      videoModel: group.videoModel || existing.videoModel || defaultVideoModel,
    }
  : fallback
```

## Info

### IN-01: Coverage misses the metadata-preservation regressions

**File:** `tests/integration/api/specific/novel-promotion-multi-shot-drafts-route.test.ts:306-463`
**Issue:** The current tests verify segment counts, placeholders, and reuse matching, but they do not assert that existing editable metadata survives a draft rebuild. The UI tests also stop at static rendering and null-clearing behavior, so they would not catch the local state clobbering described in WR-02 and WR-03.
**Fix:** Add:
```ts
it('preserves saved review metadata when multi-shot drafts are rebuilt', async () => {
  // seed existing shot group with dialogueOverrideText, selected assets,
  // storyboard mode, and mood; POST /multi-shot-drafts; expect them preserved
})

it('keeps unsaved review/video edits across a rerender with unchanged server data', () => {
  // edit local form state, rerender with same shotGroups payload, expect draft retained
})
```

---

_Reviewed: 2026-04-19T15:25:38Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
