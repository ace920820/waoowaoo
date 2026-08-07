# Phase 1: Episode Mode Entry - Research

**Researched:** 2026-04-19
**Domain:** Novel-promotion script-stage episode mode entry in an existing Next.js/React + Prisma workspace [VERIFIED: codebase grep]
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
### Mode entry placement
- **D-01:** The mode selector lives in the right-side action area at the bottom of the script page, directly below the `剧中资产` card and directly above the `确认并开始绘制` button.
- **D-02:** The selector is intentionally placed at the final pre-launch decision point so users confirm the episode path immediately before starting drawing.

### Switching policy
- **D-03:** Users can freely switch an episode’s mode before downstream drawing / storyboard / video artifacts exist.
- **D-04:** Once an episode already has downstream drawing, storyboard, or video-related artifacts, switching mode must require explicit confirmation because the downstream path may need to be rerun under the new mode.

### CTA and mode feedback
- **D-05:** The main CTA keeps the base label `确认并开始绘制`.
- **D-06:** The CTA area must also display the active mode clearly through mode labeling and/or supporting copy so users can immediately tell whether they are about to launch the multi-shot path or the traditional path.

### Legacy episode default strategy
- **D-07:** Newly configured episodes default to multi-shot mode.
- **D-08:** Existing historical episodes should use a conservative inheritance rule: episodes with clear traditional-pipeline traces default to traditional mode on migration, while all other legacy episodes default to multi-shot mode.

### the agent's Discretion
- Exact visual treatment of the mode selector card, including spacing, iconography, and microcopy style
- Whether the mode summary appears as inline helper text, pill badges, or a compact caption near the CTA, as long as the active path is unmistakable
- Exact confirmation dialog wording when switching a started episode to another mode

### Deferred Ideas

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MODE-01 | 用户可以按“集”在剧本页查看并修改当前生产模式 [VERIFIED: `.planning/REQUIREMENTS.md`] | Add an episode-backed mode field, expose it through `useWorkspaceEpisodeStageData`, and render the selector in `ScriptViewAssetsPanel` under `ScriptViewRuntime`. [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/ScriptStage.tsx`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewRuntime.tsx`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx`] |
| MODE-02 | 新创建或首次进入配置的集默认使用“多镜头片段模式” [VERIFIED: `.planning/REQUIREMENTS.md`] | Set the DB default on `NovelPromotionEpisode`, include the field in create and batch-create routes, and run a migration/backfill for legacy rows. [VERIFIED: `prisma/schema.prisma`, `src/app/api/novel-promotion/[projectId]/episodes/route.ts`, `src/app/api/novel-promotion/[projectId]/episodes/batch/route.ts`] |
| MODE-04 | 用户必须在点击“确认并开始绘制”前完成该集模式配置 [VERIFIED: `.planning/REQUIREMENTS.md`] | Keep the selector in the CTA stack and make the launch path read the persisted/current episode mode before calling the downstream action. [VERIFIED: `.planning/phases/01-episode-mode-entry/01-CONTEXT.md`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceStageRuntime.ts`] |
| UI-01 | 剧本页可以清晰展示当前集的生产模式与对应的下一步动作 [VERIFIED: `.planning/REQUIREMENTS.md`] | Reuse the existing missing-assets / CTA card family in the right panel and add explicit mode label + helper copy there. [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx`] |
| UI-03 | 当用户切换模式时，界面反馈必须让用户理解该集将进入哪条生产路径 [VERIFIED: `.planning/REQUIREMENTS.md`] | Reuse the existing rebuild confirmation pattern when downstream artifacts already exist; otherwise apply the change optimistically and update the CTA helper text immediately. [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts`, `src/lib/query/mutations/useEpisodeMutations.ts`] |
</phase_requirements>

## Summary

Phase 1 does not need a new page, new store, or new API family. The script page already resolves episode-scoped data through `useWorkspaceEpisodeStageData`, composes the stage in `ScriptStage`, and renders the final pre-launch action stack in `ScriptViewAssetsPanel`; that existing path is the correct insertion point for both mode UI and launch gating. [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/ScriptStage.tsx`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceEpisodeStageData.ts`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewRuntime.tsx`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx`]

The safest persistence boundary is the episode row, not local component state and not a project-level JSON map. The repo already supports generic episode-field patching with optimistic React Query cache updates for both `episodeData` and `projectData`, but the episode schema and route whitelist do not yet contain a production-mode field. [VERIFIED: `src/lib/query/mutations/useEpisodeMutations.ts`, `src/lib/query/hooks/useProjectData.ts`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceConfigActions.ts`, `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts`, `prisma/schema.prisma`]

Legacy handling should stay conservative and simple for Phase 1: mark an episode as traditional only when persisted traditional artifacts already exist, because the current repo has explicit helpers for storyboard/video readiness based on storyboard panels and panel videos, while shot-group artifacts are already modeled separately and should not force a legacy episode into traditional mode. [VERIFIED: `src/lib/novel-promotion/stage-readiness.ts`, `tests/unit/novel-promotion/stage-readiness.test.ts`, `prisma/schema.prisma`]

**Primary recommendation:** Add `episodeProductionMode` as an episode-level persisted field with DB default `multi_shot`, thread it through existing episode queries/runtime props, render the selector in `ScriptViewAssetsPanel`, and reuse the current rebuild-confirm pattern when changing a started episode. [VERIFIED: `prisma/schema.prisma`, `src/lib/query/mutations/useEpisodeMutations.ts`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts`]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | `15.5.7` [VERIFIED: `package.json`] | App Router page/API surface for the workspace and episode routes. [VERIFIED: `package.json`, `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts`] | Phase 1 is a brownfield extension of the existing route/component tree; adding a new rendering stack would violate repo direction. [VERIFIED: `package.json`, `.planning/PROJECT.md`] |
| React | `19.1.2` [VERIFIED: `package.json`] | Script-stage UI composition and client state. [VERIFIED: `package.json`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewRuntime.tsx`] | The mode selector belongs in the current client component tree, not in a separate modal/app shell. [VERIFIED: `.planning/phases/01-episode-mode-entry/01-CONTEXT.md`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx`] |
| `@tanstack/react-query` | `5.90.20` [VERIFIED: `package.json`] | Episode/project data reads and optimistic patching. [VERIFIED: `package.json`, `src/lib/query/hooks/useProjectData.ts`, `src/lib/query/mutations/useEpisodeMutations.ts`] | The repo already treats React Query caches as the client-side server-state source of truth. [VERIFIED: `src/lib/query/hooks/useProjectData.ts`, `src/lib/query/keys.ts`] |
| Prisma | `6.19.2` [VERIFIED: `package.json`] | Episode schema, migration, and CRUD routes. [VERIFIED: `package.json`, `prisma/schema.prisma`, `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts`] | Phase 1 needs a schema-backed episode field and migration-safe persistence. [VERIFIED: `prisma/schema.prisma`] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `next-intl` | `4.7.0` [VERIFIED: `package.json`] | Localized selector copy, confirmation copy, and CTA helper text. [VERIFIED: `package.json`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewRuntime.tsx`] | Use for all new user-facing strings in the selector/confirmation path. [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewRuntime.tsx`, `src/components/ui/CapsuleNav.tsx`] |
| Existing ConfirmDialog flow | repo-local pattern [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/NovelPromotionWorkspace.tsx`] | Safe confirmation before destructive/downstream-affecting actions. [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/NovelPromotionWorkspace.tsx`] | Use when switching mode on episodes that already have storyboard/drawing/video outputs. [VERIFIED: `.planning/phases/01-episode-mode-entry/01-CONTEXT.md`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts`] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Episode DB field [VERIFIED: `prisma/schema.prisma`] | Project-level JSON map keyed by episode ID [ASSUMED] | A project-level map would require custom merge/update logic and a second source of truth across `projectData` and `episodeData`, which conflicts with existing cache/update patterns. [VERIFIED: `src/lib/query/hooks/useProjectData.ts`, `src/lib/query/mutations/useEpisodeMutations.ts`, `scripts/guards/no-multiple-sources-of-truth.mjs`] |
| Episode DB field [VERIFIED: `prisma/schema.prisma`] | UI-only local state [ASSUMED] | UI-only state would break episode switching, reload persistence, and downstream route branching. [VERIFIED: `src/app/[locale]/workspace/[projectId]/page.tsx`, `src/lib/query/hooks/useProjectData.ts`] |
| Conservative legacy detection via persisted artifacts [VERIFIED: `src/lib/novel-promotion/stage-readiness.ts`] | Heuristic inference from script text / clip count [ASSUMED] | Script/clips exist in both paths, so content-based guessing is weak and unnecessary for Phase 1. [VERIFIED: `src/lib/novel-promotion/stage-readiness.ts`, `.planning/REQUIREMENTS.md`] |

**Installation:** No new package is required for Phase 1; implement on the current stack. [VERIFIED: `package.json`, `.planning/PROJECT.md`]

**Version verification:** No new dependency is recommended, so package-registry verification is not a planning blocker for this phase. Existing repo versions are pinned in `package.json`. [VERIFIED: `package.json`]

## Architecture Patterns

### Recommended Project Structure

```text
prisma/
  schema.prisma                           # add episode production-mode field [VERIFIED: prisma/schema.prisma]
src/app/api/novel-promotion/[projectId]/episodes/
  route.ts                                # apply default on create [VERIFIED: src/app/api/novel-promotion/[projectId]/episodes/route.ts]
  batch/route.ts                          # apply default on batch import [VERIFIED: src/app/api/novel-promotion/[projectId]/episodes/batch/route.ts]
  [episodeId]/route.ts                    # whitelist patch/get field [VERIFIED: src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts]
src/lib/query/
  hooks/useProjectData.ts                 # include field in episode payload typing [VERIFIED: src/lib/query/hooks/useProjectData.ts]
  mutations/useEpisodeMutations.ts        # reuse optimistic patch path [VERIFIED: src/lib/query/mutations/useEpisodeMutations.ts]
src/app/[locale]/workspace/[projectId]/modes/novel-promotion/
  hooks/useWorkspaceEpisodeStageData.ts   # expose mode with clips/storyboards [VERIFIED: src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceEpisodeStageData.ts]
  components/ScriptStage.tsx              # pass mode + update handler into script view [VERIFIED: src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/ScriptStage.tsx]
  components/script-view/ScriptViewRuntime.tsx   # own derived state + switch guard [VERIFIED: src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewRuntime.tsx]
  components/script-view/ScriptViewAssetsPanel.tsx # render selector above CTA [VERIFIED: src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx]
```

### Pattern 1: Server-backed episode mode with optimistic cache

**What:** Persist the mode on `NovelPromotionEpisode`, expose it through `useEpisodeData`, and update it through `useUpdateProjectEpisodeField`. [VERIFIED: `prisma/schema.prisma`, `src/lib/query/hooks/useProjectData.ts`, `src/lib/query/mutations/useEpisodeMutations.ts`]

**When to use:** Always; the product decision is per-episode mode, and the repo already resolves episode selection and episode detail independently of project detail. [VERIFIED: `.planning/PROJECT.md`, `src/app/[locale]/workspace/[projectId]/page.tsx`, `src/components/ui/CapsuleNav.tsx`]

**Example:**

```ts
// Source: src/lib/query/mutations/useEpisodeMutations.ts
// Existing pattern already PATCHes a single episode field and updates both caches.
await updateProjectEpisodeMutation.mutateAsync({
  episodeId,
  key: 'episodeProductionMode',
  value: 'multi_shot',
})
```

### Pattern 2: Derive UI state in `ScriptViewRuntime`, render in `ScriptViewAssetsPanel`

**What:** Keep persisted mode as the source of truth, but compute derived flags such as `hasTraditionalTrace`, `hasAnyDownstreamArtifacts`, `ctaModeLabel`, and `requiresSwitchConfirm` in `ScriptViewRuntime`, then pass those props into `ScriptViewAssetsPanel`. [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewRuntime.tsx`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx`]

**When to use:** For phase-local UI orchestration on the script page, because `ScriptViewRuntime` already computes asset coverage/readiness and is the clean composition seam between stage data and the right-side control column. [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewRuntime.tsx`]

**Example:**

```ts
// Source: src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewRuntime.tsx
const assetCoverage = getStoryboardAssetCoverageForClips({ clips, characters, locations })
const storyboardTextReadiness = getStoryboardTextGenerationReadiness({ clips })

// Add mode-derived state here, then pass it into ScriptViewAssetsPanel.
```

### Pattern 3: Reuse rebuild confirmation for mode switches on started episodes

**What:** Apply the existing "check downstream, then confirm" pattern before changing mode on episodes that already have persisted storyboard/video outputs. [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts`]

**When to use:** When `storyboardCount > 0`, `panelCount > 0`, or episode-level readiness already reports storyboard/video outputs. [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts`, `src/lib/novel-promotion/stage-readiness.ts`]

**Example:**

```ts
// Source: src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts
const downstream = await checkStoryboardDownstreamData()
if (downstream.shouldConfirm) {
  setShowRebuildConfirm(true)
  return
}
await action()
```

### Detection Heuristics For Legacy Episodes

| Rule | Outcome | Confidence |
|------|---------|------------|
| If an episode has at least one storyboard with at least one panel, inherit `traditional`. [VERIFIED: `src/lib/novel-promotion/stage-readiness.ts`, `tests/unit/novel-promotion/stage-readiness.test.ts`] | Strong traditional trace. [VERIFIED: codebase grep] | HIGH |
| If an episode has at least one storyboard panel with `videoUrl`, inherit `traditional`. [VERIFIED: `src/lib/novel-promotion/stage-readiness.ts`, `tests/unit/novel-promotion/stage-readiness.test.ts`] | Strong traditional trace with downstream video work. [VERIFIED: codebase grep] | HIGH |
| If an episode has no storyboard panels, default to `multi_shot` even if clips/screenplay exist. [VERIFIED: `src/lib/novel-promotion/stage-readiness.ts`, `.planning/phases/01-episode-mode-entry/01-CONTEXT.md`] | Clips are not a path discriminator in the current schema. [VERIFIED: `prisma/schema.prisma`] | HIGH |
| Do not classify an episode as traditional only because `shotGroups` exist. [VERIFIED: `src/lib/novel-promotion/stage-readiness.ts`, `prisma/schema.prisma`] | `shotGroups` are a separate artifact family and do not prove the legacy traditional path. [VERIFIED: codebase grep] | MEDIUM |

### Safe Switching Behavior

| Existing episode state | Allowed behavior | Implementation note |
|------------------------|------------------|---------------------|
| No storyboard panels, no panel videos, no shot-group media outputs. [VERIFIED: `src/lib/novel-promotion/stage-readiness.ts`] | Switch immediately. [VERIFIED: `.planning/phases/01-episode-mode-entry/01-CONTEXT.md`] | Optimistically PATCH the episode field and update CTA helper copy in place. [VERIFIED: `src/lib/query/mutations/useEpisodeMutations.ts`] |
| Storyboard panels exist. [VERIFIED: `src/lib/novel-promotion/stage-readiness.ts`] | Require explicit confirmation. [VERIFIED: `.planning/phases/01-episode-mode-entry/01-CONTEXT.md`] | Reuse `ConfirmDialog`/`useRebuildConfirm` copy and flow. [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/NovelPromotionWorkspace.tsx`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts`] |
| Panel videos or shot-group videos/composite images exist. [VERIFIED: `src/lib/novel-promotion/stage-readiness.ts`] | Require explicit confirmation. [VERIFIED: `.planning/phases/01-episode-mode-entry/01-CONTEXT.md`] | Phrase the dialog as a path switch that may require rerunning downstream generation. [VERIFIED: context + existing confirm pattern] |

### Anti-Patterns to Avoid

- **Local mode state inside `ScriptViewAssetsPanel`:** This creates a second source of truth beside `episodeData` and violates the repo’s existing server-state pattern. [VERIFIED: `src/lib/query/hooks/useProjectData.ts`, `scripts/guards/no-server-mirror-state.mjs`, `scripts/guards/no-multiple-sources-of-truth.mjs`]
- **Project-global mode instead of episode mode:** The workspace already selects and renders data by episode, and the product decision is explicitly per episode. [VERIFIED: `.planning/PROJECT.md`, `src/components/ui/CapsuleNav.tsx`, `src/app/[locale]/workspace/[projectId]/page.tsx`]
- **Content-based legacy guessing from clip text:** The current persisted artifact helpers already provide stronger signals from storyboards/videos. [VERIFIED: `src/lib/novel-promotion/stage-readiness.ts`]
- **Adding a second confirmation system:** There is already a workspace-level confirmation dialog and downstream-check pattern. [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/NovelPromotionWorkspace.tsx`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts`] |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Episode field persistence | Custom fetch wrapper for mode updates [ASSUMED] | `useUpdateProjectEpisodeField` + existing PATCH route. [VERIFIED: `src/lib/query/mutations/useEpisodeMutations.ts`, `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts`] | It already handles optimistic updates for both episode and project caches. [VERIFIED: `src/lib/query/mutations/useEpisodeMutations.ts`] |
| Downstream artifact detection | Ad hoc scans in the component tree [ASSUMED] | `resolveEpisodeStageArtifacts` and storyboard stats helper. [VERIFIED: `src/lib/novel-promotion/stage-readiness.ts`, `src/lib/query/mutations/useProjectConfigMutations.ts`] | The helpers already encode the repo’s current definition of storyboard/video readiness. [VERIFIED: `tests/unit/novel-promotion/stage-readiness.test.ts`] |
| Started-episode confirmation | New modal state machine [ASSUMED] | `useRebuildConfirm` + `ConfirmDialog`. [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/NovelPromotionWorkspace.tsx`] | Reuse keeps switch behavior consistent with existing destructive/rebuild actions. [VERIFIED: codebase grep] |
| Episode navigation affordance | New episode picker just for mode [ASSUMED] | Existing `EpisodeSelector` and selected-episode URL flow. [VERIFIED: `src/components/ui/CapsuleNav.tsx`, `src/app/[locale]/workspace/[projectId]/page.tsx`] | The workspace already centers episode selection in one place. [VERIFIED: codebase grep] |

**Key insight:** Phase 1 should add one new persisted episode property and one new script-page CTA card, not a new state model. [VERIFIED: codebase grep]

## Common Pitfalls

### Pitfall 1: Adding the DB field but forgetting the route/type/query surfaces

**What goes wrong:** The DB persists the value, but the UI still reads `undefined` because the GET route typing and stage hook never expose it. [VERIFIED: `prisma/schema.prisma`, `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceEpisodeStageData.ts`]  
**Why it happens:** The episode PATCH helper is generic, but the route currently whitelists only `name`, `description`, `novelText`, `storyboardDefaultMoodPresetId`, `audioUrl`, and `srtContent`. [VERIFIED: `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts`]  
**How to avoid:** Update Prisma schema, project-data typing, episode GET/PATCH route, `useWorkspaceEpisodeStageData`, and any episode summary typing in one wave. [VERIFIED: codebase grep]  
**Warning signs:** Mode appears correct until reload or episode switch, then reverts. [VERIFIED: `src/lib/query/hooks/useProjectData.ts`, `src/app/[locale]/workspace/[projectId]/page.tsx`]

### Pitfall 2: Treating mode as local UI state

**What goes wrong:** Mode changes disappear on refresh, mismatch across tabs, or diverge from downstream launch behavior. [VERIFIED: `src/lib/query/hooks/useProjectData.ts`, `src/app/[locale]/workspace/[projectId]/page.tsx`]  
**Why it happens:** The workspace URL selects episodes, while episode data comes from server-backed React Query caches. [VERIFIED: `src/app/[locale]/workspace/[projectId]/page.tsx`, `src/lib/query/keys.ts`]  
**How to avoid:** Keep persisted episode mode as source of truth and reserve local state only for pending confirmation UI. [VERIFIED: `src/lib/query/mutations/useEpisodeMutations.ts`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts`]  
**Warning signs:** `useState(episode?....)` patterns or duplicated `localEpisode` objects appear. [VERIFIED: `scripts/guards/no-server-mirror-state.mjs`] 

### Pitfall 3: Misclassifying legacy episodes from weak traces

**What goes wrong:** Old episodes flip into the wrong mode and surprise users. [VERIFIED: `.planning/phases/01-episode-mode-entry/01-CONTEXT.md`]  
**Why it happens:** Clips and screenplay exist before either downstream path, so they are not reliable evidence of traditional usage. [VERIFIED: `prisma/schema.prisma`, `src/lib/novel-promotion/stage-readiness.ts`]  
**How to avoid:** Use only persisted storyboard panels and panel videos as traditional traces for the migration. [VERIFIED: `src/lib/novel-promotion/stage-readiness.ts`, `tests/unit/novel-promotion/stage-readiness.test.ts`]  
**Warning signs:** A migration rule references `clips.length`, `screenplay`, or episode text only. [VERIFIED: codebase grep]

### Pitfall 4: Creating a new confirm UX instead of reusing the existing one

**What goes wrong:** Users see different confirmation behavior for similar destructive actions, and the implementation duplicates workspace modal state. [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/NovelPromotionWorkspace.tsx`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts`]  
**Why it happens:** The selector lives deep in the script panel, while the current dialog is owned at workspace level. [VERIFIED: `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/NovelPromotionWorkspace.tsx`]  
**How to avoid:** Lift switch-confirm intent into stage/runtime or workspace-level state instead of mounting a second dialog inside `ScriptViewAssetsPanel`. [VERIFIED: codebase grep]  
**Warning signs:** A new modal component is added under `script-view/` for the same downstream-risk decision. [VERIFIED: codebase grep]

## Code Examples

Verified patterns from official repo sources:

### Generic Episode Field Patch

```ts
// Source: src/lib/query/mutations/useEpisodeMutations.ts
return useMutation({
  mutationFn: async ({ episodeId, key, value }) =>
    await requestJsonWithError(
      `/api/novel-promotion/${projectId}/episodes/${episodeId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      },
      'Failed to update episode',
    ),
})
```

### Script-Stage Composition Seam

```tsx
// Source: src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/ScriptStage.tsx
const { clips, storyboards } = useWorkspaceEpisodeStageData()

return (
  <ScriptView
    projectId={projectId}
    episodeId={episodeId}
    clips={clips}
    storyboards={storyboards}
    onGenerateStoryboard={runtime.onRunScriptToStoryboard}
  />
)
```

### Existing CTA Placement

```tsx
// Source: src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx
<div className="mt-4 mb-4">
  {!allAssetsHaveImages && /* helper card */}
  <button onClick={onGenerateStoryboard}>
    {isSubmittingStoryboardBuild ? tScript('generate.generating') : tScript('generate.startGenerate')}
  </button>
</div>
```

### Existing Started-Work Confirmation

```ts
// Source: src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts
const downstream = await checkStoryboardDownstreamData()
if (!downstream.shouldConfirm) {
  await action()
  return
}
setRebuildConfirmContext({
  actionType,
  storyboardCount: downstream.storyboardCount,
  panelCount: downstream.panelCount,
})
setShowRebuildConfirm(true)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct component-local copies of server data are discouraged. [VERIFIED: `scripts/guards/no-server-mirror-state.mjs`] | Server-backed React Query caches are the workspace source of truth. [VERIFIED: `src/lib/query/hooks/useProjectData.ts`, `src/lib/query/keys.ts`] | Current repo state as of 2026-04-19. [VERIFIED: codebase grep] | Phase 1 should fit into cache-backed episode updates, not introduce local mirrors. [VERIFIED: codebase grep] |
| Downstream readiness can be derived from persisted artifacts. [VERIFIED: `src/lib/novel-promotion/stage-readiness.ts`] | Script/storyboard/video stage status is already computed from clips, storyboard panels, and shot-group/video outputs. [VERIFIED: `src/lib/novel-promotion/stage-readiness.ts`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/WorkspaceHeaderShell.tsx`] | Current repo state as of 2026-04-19. [VERIFIED: codebase grep] | Phase 1 can piggyback on existing artifact signals for legacy defaults and switch confirmation. [VERIFIED: codebase grep] |
| Episode updates formerly required bespoke route calls per field. [ASSUMED] | The repo now has a generic `useUpdateProjectEpisodeField` mutation plus optimistic cache patching. [VERIFIED: `src/lib/query/mutations/useEpisodeMutations.ts`] | Current repo state as of 2026-04-19. [VERIFIED: codebase grep] | Adding one more episode field is low-risk if the schema and route whitelist are updated together. [VERIFIED: codebase grep] |

**Deprecated/outdated:**
- Deriving core workflow state only in the UI is misaligned with current repo guards and cache patterns. [VERIFIED: `scripts/guards/no-server-mirror-state.mjs`, `scripts/guards/no-multiple-sources-of-truth.mjs`]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A project-level JSON map keyed by episode ID is a feasible alternative. [ASSUMED] | Standard Stack / Alternatives Considered | Low; recommendation still remains to avoid it. |
| A2 | UI-only local mode state would be straightforward to add. [ASSUMED] | Standard Stack / Alternatives Considered | Low; recommendation still remains to avoid it. |
| A3 | Ad hoc component scans or a new modal state machine would be possible alternatives. [ASSUMED] | Don't Hand-Roll | Low; these are explicitly not recommended. |
| A4 | Earlier repo history may have used more bespoke episode update calls. [ASSUMED] | State of the Art | Low; this does not affect the Phase 1 plan. |

## Resolved Questions

1. **Should shot-group-only episodes count as "started" for switch confirmation, even if they have no storyboard panels?**
   - Decision: **Yes.** Shot-group-only episodes count as started for mode-switch confirmation, because they already contain downstream production artifacts that could become misleading after a path flip. [VERIFIED: `.planning/phases/01-episode-mode-entry/01-CONTEXT.md`, `src/lib/novel-promotion/stage-readiness.ts`]
   - Implementation rule: use broader confirmation gating for switching (`storyboards`, storyboard panels/videos, or shot-group outputs all count), but keep the migration-to-traditional heuristic narrower. [VERIFIED: codebase inference grounded in current helpers]
   - Migration rule: only persisted storyboard-panel traces or panel-video traces backfill a legacy episode to `traditional`; shot-group-only traces still migrate to `multi_shot`. [VERIFIED: `.planning/phases/01-episode-mode-entry/01-CONTEXT.md`, `src/lib/novel-promotion/stage-readiness.ts`, `tests/unit/novel-promotion/stage-readiness.test.ts`]

2. **What enum/string names should become the contract?**
   - Decision: lock the persisted/API/UI contract to **`multi_shot`** and **`traditional`** under the episode field name **`episodeProductionMode`**. [VERIFIED: `.planning/REQUIREMENTS.md`, `.planning/phases/01-episode-mode-entry/01-CONTEXT.md`]
   - Reasoning: these values align with the product language already settled in Phase 1 while fitting the repo's existing string-field conventions. [VERIFIED: `prisma/schema.prisma`, `src/types/project.ts`]
   - Propagation rule: schema, migration, API validation, query typing, workspace runtime, CTA branching, and locale copy must all branch only on these two literals. [VERIFIED: planning recommendation grounded in current architecture]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | App/tooling/test execution [VERIFIED: `package.json`] | ✓ [VERIFIED: local command] | `v22.22.0` [VERIFIED: local command] | Repo only requires `>=18.18.0`. [VERIFIED: `package.json`] |
| npm | Scripts/test execution [VERIFIED: `package.json`] | ✓ [VERIFIED: local command] | `10.9.4` [VERIFIED: local command] | Repo only requires `>=9.0.0`. [VERIFIED: `package.json`] |
| Docker | Integration/system test bootstrap when `BILLING_TEST_BOOTSTRAP=1` or `SYSTEM_TEST_BOOTSTRAP=1`. [VERIFIED: `tests/setup/global-setup.ts`] | ✓ [VERIFIED: local command] | `29.3.0` [VERIFIED: local command] | For quick unit runs, use non-bootstrap vitest commands. [VERIFIED: `package.json`, `tests/setup/global-setup.ts`] |

**Missing dependencies with no fallback:**
- None. [VERIFIED: local command]

**Missing dependencies with fallback:**
- None. [VERIFIED: local command]

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8. [VERIFIED: `package.json`, `vitest.config.ts`] |
| Config file | `vitest.config.ts`. [VERIFIED: `vitest.config.ts`] |
| Quick run command | `npx vitest run tests/unit/script-view/script-view-assets-panel.test.ts tests/unit/novel-promotion/stage-readiness.test.ts tests/unit/novel-promotion/storyboard-readiness.test.ts tests/unit/workspace/episode-selection.test.ts` [VERIFIED: `package.json`, existing test files] |
| Full suite command | `npm run test:behavior:full` for behavior-focused coverage, or `npm run verify:commit` for the full local gate. [VERIFIED: `package.json`] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MODE-01 | Script page shows and updates episode mode per selected episode. [VERIFIED: `.planning/REQUIREMENTS.md`] | unit + integration | `npx vitest run tests/unit/script-view/script-view-assets-panel.test.ts` | ❌ Wave 0 |
| MODE-02 | New/first-configured episodes default to multi-shot. [VERIFIED: `.planning/REQUIREMENTS.md`] | integration API | `npx vitest run tests/integration/api/contract/novel-promotion-episode-create-text.test.ts` | ❌ Wave 0 |
| MODE-04 | CTA cannot launch ambiguously; launch path matches current mode. [VERIFIED: `.planning/REQUIREMENTS.md`] | unit | `npx vitest run tests/unit/script-view/script-view-assets-panel.test.ts tests/unit/novel-promotion/stage-readiness.test.ts` | ❌ Wave 0 |
| UI-01 | CTA area clearly shows active mode and next step. [VERIFIED: `.planning/REQUIREMENTS.md`] | unit render | `npx vitest run tests/unit/script-view/script-view-assets-panel.test.ts` | ❌ Wave 0 |
| UI-03 | Switching mode provides understandable feedback and confirmation when started. [VERIFIED: `.planning/REQUIREMENTS.md`] | unit + integration | `npx vitest run tests/unit/novel-promotion/stage-readiness.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/script-view/script-view-assets-panel.test.ts tests/unit/novel-promotion/stage-readiness.test.ts tests/unit/novel-promotion/storyboard-readiness.test.ts tests/unit/workspace/episode-selection.test.ts` [VERIFIED: existing test files]
- **Per wave merge:** `npm run test:behavior:full` [VERIFIED: `package.json`]
- **Phase gate:** `npm run verify:commit` before `/gsd-verify-work` [VERIFIED: `package.json`, `AGENTS.md`]

### Wave 0 Gaps

- [ ] `tests/unit/script-view/script-view-mode-entry.test.ts` — cover selector rendering, CTA helper copy, and immediate switching on clean episodes. [VERIFIED: gap inferred from existing `tests/unit/script-view/script-view-assets-panel.test.ts`]
- [ ] `tests/unit/novel-promotion/episode-mode-heuristics.test.ts` — cover migration/default heuristics for storyboard-panel traces vs clip-only episodes. [VERIFIED: gap inferred from existing readiness tests]
- [ ] `tests/integration/api/specific/novel-promotion-episode-mode-route.test.ts` — cover GET/PATCH exposure of the new episode field and optimistic cache alignment expectations. [VERIFIED: gap inferred from existing API test catalog]
- [ ] `tests/unit/novel-promotion/mode-switch-confirmation.test.ts` — cover confirmation gating when storyboard/video artifacts already exist. [VERIFIED: gap inferred from `useRebuildConfirm` coverage absence in search results]

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes [VERIFIED: `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts`] | Route access goes through `requireProjectAuthLight` / `requireProjectAuth`. [VERIFIED: `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts`, `src/app/api/novel-promotion/[projectId]/episodes/route.ts`] |
| V3 Session Management | yes [VERIFIED: `src/app/api/projects/[projectId]/data/route.ts`, `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts`] | Session-backed auth helpers gate project and episode routes. [VERIFIED: `src/app/api/projects/[projectId]/data/route.ts`, `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts`] |
| V4 Access Control | yes [VERIFIED: episode routes] | Project ownership is checked before project data loads, and episode routes require project auth before read/write. [VERIFIED: `src/app/api/projects/[projectId]/data/route.ts`, `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts`] |
| V5 Input Validation | yes [VERIFIED: route code] | Route whitelist/normalization should explicitly include the new field and reject unknown semantics by omission. [VERIFIED: `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts`] |
| V6 Cryptography | no direct crypto change in this phase. [VERIFIED: `.planning/ROADMAP.md`, codebase grep] | Reuse existing auth/session stack; do not introduce custom crypto. [ASSUMED] |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized episode read/write | Elevation of Privilege | Keep all episode GET/PATCH endpoints behind existing project auth helpers. [VERIFIED: `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts`] |
| Broken launch branching due to stale client state | Tampering | Read/write through React Query episode caches and invalidate both episode/project queries on settle. [VERIFIED: `src/lib/query/mutations/useEpisodeMutations.ts`] |
| Unsanitized enum/string drift causing invalid downstream behavior | Tampering | Normalize allowed mode values in the route/schema layer and branch only on known literals. [ASSUMED] |

## Sources

### Primary (HIGH confidence)

- `prisma/schema.prisma` - episode model shape, clip/storyboard/shot-group relations, existing string-field conventions.
- `src/app/api/novel-promotion/[projectId]/episodes/[episodeId]/route.ts` - current episode GET/PATCH contract and auth.
- `src/app/api/novel-promotion/[projectId]/episodes/route.ts` - single-episode creation flow.
- `src/app/api/novel-promotion/[projectId]/episodes/batch/route.ts` - batch creation flow.
- `src/lib/query/mutations/useEpisodeMutations.ts` - optimistic episode patch pattern.
- `src/lib/query/hooks/useProjectData.ts` - episode/project query surfaces.
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/ScriptStage.tsx` - script-stage composition seam.
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewRuntime.tsx` - right/left panel orchestration and readiness computation.
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/script-view/ScriptViewAssetsPanel.tsx` - current CTA stack and insertion point.
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useWorkspaceEpisodeStageData.ts` - current episode-stage payload shape.
- `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/hooks/useRebuildConfirm.ts` - existing confirmation behavior for started downstream work.
- `src/lib/novel-promotion/stage-readiness.ts` - persisted-artifact detection logic.
- `src/components/ui/CapsuleNav.tsx` - episode selector pattern.
- `tests/unit/novel-promotion/stage-readiness.test.ts` - verified readiness semantics.
- `tests/unit/novel-promotion/storyboard-readiness.test.ts` - verified script/storyboard readiness semantics.
- `tests/unit/script-view/script-view-assets-panel.test.ts` - existing script-view panel test surface.
- `package.json` - runtime/test stack and commands.
- `vitest.config.ts` - test framework configuration.
- `tests/setup/global-setup.ts` - Docker-backed integration/system bootstrap.

### Secondary (MEDIUM confidence)

- `.planning/phases/01-episode-mode-entry/01-CONTEXT.md` - locked product decisions and phase scope.
- `.planning/PROJECT.md` - brownfield constraints and product rationale.
- `.planning/REQUIREMENTS.md` - requirement IDs and wording.
- `.planning/ROADMAP.md` - phase mapping and success criteria.
- `scripts/guards/no-server-mirror-state.mjs` - guardrail against local server-data mirrors.
- `scripts/guards/no-multiple-sources-of-truth.mjs` - guardrail against duplicate state sources.

### Tertiary (LOW confidence)

- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependency is needed and the current stack is explicit in `package.json`. [VERIFIED: `package.json`]
- Architecture: HIGH - the insertion point, persistence path, and confirmation pattern are all already present in the repo. [VERIFIED: codebase grep]
- Pitfalls: HIGH - the main failure modes follow directly from current route whitelists, cache patterns, and readiness helpers. [VERIFIED: codebase grep]

**Research date:** 2026-04-19
**Valid until:** 2026-05-19
