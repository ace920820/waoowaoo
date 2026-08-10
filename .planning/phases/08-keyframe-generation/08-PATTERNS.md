# Phase 8: 新关键帧生成与版本选择 - Pattern Map

**Mapped:** 2026-08-10
**Files analyzed:** 26 planned new/modified files
**Analogs found:** 26 / 26

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `prisma/schema.prisma` | model/migration | CRUD | `RemakePromptTrack` / `RemakePromptVersion` | exact |
| `src/lib/remake-projects/keyframes/contracts.ts` | utility/contract | transform | `prompt/contracts.ts` | exact |
| `src/lib/remake-projects/keyframes/task-contract.ts` | utility/contract | request-response | `prompt/task-contract.ts` | exact |
| `src/lib/remake-projects/keyframes/service.ts` | service | CRUD | `prompt/service.ts` | exact |
| `src/lib/remake-projects/keyframes/action-sheet.ts` | service | file-I/O | `scenedetect/keyframes.ts` + `panel-image-task-handler.ts` | role-match |
| `src/lib/remake-projects/keyframes/adapter.ts` | adapter/view model | transform | `remake-projects/service.ts` | role-match |
| `src/lib/remake-projects/service.ts` | service | CRUD | existing snapshot projection | exact |
| `src/lib/task/types.ts` | config/contract | event-driven | existing `TASK_TYPE` catalog | exact |
| `src/lib/task/queues.ts` | config | event-driven | existing `IMAGE_TYPES` routing | exact |
| `src/lib/workers/handlers/remake-keyframe-image.ts` | worker/service | event-driven, file-I/O | `panel-image-task-handler.ts` | role-match |
| `src/app/api/remake-projects/[projectId]/keyframes/route.ts` | route | request-response | `prompts/analyze/route.ts` | exact |
| `src/app/api/remake-projects/[projectId]/keyframes/tracks/[trackId]/route.ts` | route | request-response | `prompts/tracks/[trackId]/route.ts` | exact |
| `src/lib/query/hooks/useRemakeProject.ts` | hook | request-response | current Remake snapshot hook | exact |
| `src/lib/query/mutations/remake-keyframe-mutations.ts` | hook | request-response | `remake-prompt-mutations.ts` | exact |
| `src/app/[locale]/workspace/[projectId]/modes/remake/RemakeWorkbench.tsx` | component/controller | request-response | current workbench stage map | exact |
| `src/app/[locale]/workspace/[projectId]/modes/remake/prompt/PromptStage.tsx` | component | request-response | current Prompt stage summary/actions | exact |
| `src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/RemakeStoryboardStage.tsx` | component | request-response | `ImageSection.tsx` + `CandidateSelector.tsx` | role-match |
| `src/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoStage.tsx` | component | request-response | `VideoStageRoute.tsx` / `VideoPanelCardBody.tsx` | role-match |
| `tests/unit/remake-projects/remake-keyframe-task-contract.test.ts` | test | transform | `prompt-task-contract.test.ts` | exact |
| `tests/integration/remake-projects/keyframe-service.test.ts` | test | CRUD | Prompt service integration tests | role-match |
| `tests/integration/api/remake-projects-keyframes-submit.test.ts` | test | request-response | `remake-projects-prompt-review.test.ts` | role-match |
| `tests/integration/api/remake-projects-keyframes-adopt.test.ts` | test | request-response | `remake-projects-prompt-review.test.ts` | exact |
| `tests/unit/remake-projects/remake-keyframe-stage.test.tsx` | test | request-response | `remake-prompt-stage-contract.test.ts` | role-match |
| `tests/unit/remake-projects/remake-video-input-contract.test.ts` | test | transform | `remake-prompt-stage-contract.test.ts` | role-match |
| `tests/unit/worker/remake-keyframe-image.test.ts` | test | event-driven | `remake-prompt.test.ts` / `panel-image-task-handler.test.ts` | role-match |
| `tests/e2e/remake-keyframes.spec.ts` | test | request-response | `remake-prompt.spec.ts` | exact |

## Pattern Assignments

### `prisma/schema.prisma` (model/migration, CRUD)

**Analog:** `prisma/schema.prisma:586-657` (`RemakePromptTrack`, immutable `RemakePromptVersion`, and run rows).

**Relations and append-only version pattern** (lines 586-637):
```prisma
model RemakePromptTrack {
  shotId           String
  targetKey        String
  adoptedVersionId String?               @unique
  versions         RemakePromptVersion[] @relation("RemakePromptTrackVersions")
  adoptedVersion   RemakePromptVersion?  @relation("RemakePromptTrackAdoptedVersion", fields: [adoptedVersionId], references: [id], onDelete: SetNull)

  @@unique([shotId, targetKey])
}

model RemakePromptVersion {
  trackId          String
  shotRevisionId   String?
  versionNumber    Int
  inputFingerprint String
  inputSnapshot    Json
  taskId           String?
  invalidatedAt    DateTime?

  @@unique([trackId, versionNumber])
  @@index([shotRevisionId])
  @@index([taskId])
}
```

Create a keyframe track per `(shot, revision, slot)`, a batch per submitted Task, and immutable candidates per batch. Keep `adoptedCandidateId` only on the track. Extend `RemakeInvalidation` with keyframe track/batch/candidate references rather than deleting old rows.

### `src/lib/remake-projects/keyframes/contracts.ts` and `task-contract.ts` (utility/contracts, request-response)

**Analog:** `src/lib/remake-projects/prompt/contracts.ts:66-85`, `src/lib/remake-projects/prompt/task-contract.ts:1-116`.

**Strict snapshot input** (contracts lines 66-75):
```ts
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
```

**Dedupe and stale-input validation** (task contract lines 43-100):
```ts
function assertProjectSnapshot(projectId: string, snapshot: PromptInputSnapshot) {
  if (snapshot.projectId !== projectId) throw new Error('REMAKE_PROMPT_PROJECT_MISMATCH')
}

const inputFingerprint = promptInputFingerprint(inputSnapshot)
const dedupeFingerprint = fingerprintImageDedupe({
  projectId, shotId: inputSnapshot.shotId, slot, operationKey, inputFingerprint,
})
```

Keyframe payload must add only frozen data: approved Prompt version ID/text, selected slot, resolved image model/options, reference asset IDs, candidate count, and input fingerprint. Use Zod `.strict()`; operation keys dedupe repeated clicks but permit explicit regeneration.

### `src/lib/remake-projects/keyframes/service.ts` and `src/lib/remake-projects/service.ts` (service, CRUD)

**Analog:** `src/lib/remake-projects/prompt/service.ts:35-101, 273-318`; snapshot assembly in `src/lib/remake-projects/service.ts:84-175`.

**Current-state recheck before append** (prompt service lines 35-75):
```ts
export async function assertPromptInputCurrent(tx: Client, snapshot: PromptInputSnapshot): Promise<void> {
  const parsed = promptInputSnapshotSchema.parse(snapshot)
  const current = await currentInput(tx, parsed)
  if (promptInputFingerprint(current) !== promptInputFingerprint(parsed)) {
    throw new Error('REMAKE_PROMPT_INPUT_STALE')
  }
}
```

**Server-owned adopted pointer projection** (`service.ts:150-160`):
```ts
const latest = versions[0]
const adopted = versions.find((version) => version.id === track.adoptedVersionId)
return {
  id: track.id,
  latestVersion: latest ? { id: latest.id, versionNumber: latest.versionNumber } : null,
  adoptedVersion: adopted ? { id: adopted.id, versionNumber: adopted.versionNumber } : null,
}
```

Use one short transaction for current-revision validation, batch/candidate append, provenance, and adoption pointer mutation. Snapshot must expose original frames separately from generation slots, batches, candidates, invalidation status, action sheet, eligible count, and video-input readiness. Candidate preview/comparison is client-only state and must never update the adopted pointer.

### `src/lib/remake-projects/keyframes/action-sheet.ts` (service, file-I/O)

**Analog:** revision evidence lifecycle in `src/lib/remake-projects/service.ts:178-197`; storage path in `src/lib/workers/handlers/panel-image-task-handler.ts:335-357`.

**Existing invalidation record write** (`service.ts:189-194`):
```ts
await client.remakeInvalidation.createMany({
  data: outputs.map((output) => ({
    shotId: shotRow.id, revisionId: revision.id, reason: input.changeReason,
    status: 'needs_review', outputVersionId: output.id,
  })),
})
```

**Existing generated asset upload** (panel worker lines 343-357):
```ts
const cosKey = await uploadImageSourceToCos(source, 'panel-candidate', `${panel.id}-${i}`)
candidates.push(cosKey)
```

Generate the deterministic Start -> Middle -> End contact sheet only for an approved current revision. Store ordered source media IDs/timestamps, revision ID and renderer schema in provenance; old sheets remain addressable and are marked invalidated.

### `src/lib/task/types.ts`, `src/lib/task/queues.ts`, and `src/lib/workers/handlers/remake-keyframe-image.ts` (worker/event-driven, file-I/O)

**Analog:** `src/lib/task/queues.ts:32-113`, `src/lib/workers/handlers/panel-image-task-handler.ts:200-385`.

**Queue routing** (queues lines 56-75):
```ts
const IMAGE_TYPES = new Set<TaskType>([
  TASK_TYPE.IMAGE_PANEL,
  TASK_TYPE.IMAGE_SHOT_GROUP,
])

export function getQueueTypeByTaskType(type: TaskType): QueueType {
  if (IMAGE_TYPES.has(type)) return 'image'
  return 'text'
}
```

**Gateway/reference normalization/candidate loop** (panel worker lines 248-254, 335-357):
```ts
const candidateCount = clampCount(payload.candidateCount ?? payload.count, 1, 4, 1)
const normalizedRefs = await normalizeReferenceImagesForGeneration(refs)

for (let i = 0; i < candidateCount; i++) {
  const source = await resolveImageSourceFromGeneration(job, {
    userId: job.data.userId, modelId: modelKey, prompt,
    options: { referenceImages: normalizedRefs, aspectRatio },
  })
  const cosKey = await uploadImageSourceToCos(source, 'panel-candidate', `${panel.id}-${i}`)
  candidates.push(cosKey)
}
```

Reuse the image queue, `reportTaskProgress`, `assertTaskActive`, model gateway, reference normalization, and storage upload. Do **not** copy persistence at `panel-image-task-handler.ts:360-378`: it writes `imageUrl`, `previousImageUrl`, and `candidateImages` on a Panel, which violates batch history. The worker must call Remake keyframe service to append immutable candidates after its stale snapshot check.

### Keyframe API routes (route, request-response)

**Analogs:** `src/app/api/remake-projects/[projectId]/prompts/analyze/route.ts:1-77`; `src/app/api/remake-projects/[projectId]/prompts/tracks/[trackId]/route.ts:1-77`.

**Auth, schema, submit pattern** (analyze route lines 48-67):
```ts
const auth = await requireProjectAuthLight(projectId)
if (isErrorResponse(auth)) return auth
const body = bodySchema.safeParse(await request.json().catch(() => null))
if (!body.success) throw new ApiError('INVALID_PARAMS')

const submitted = await submitTask({
  userId: auth.session.user.id, locale: 'zh', projectId,
  type: descriptor.taskType, targetType: descriptor.targetType,
  targetId: descriptor.targetId, payload: descriptor.payload,
  dedupeKey: descriptor.dedupeKey, maxAttempts: 1,
})
return NextResponse.json({ taskId: submitted.taskId }, { status: 202 })
```

**Adopt mutation error mapping** (track route lines 55-76):
```ts
try {
  const track = await approveAndAdoptPromptVersion({ projectId, shotId: detail.track.shotId, versionId: body.data.versionId, reviewerId: auth.session.user.id })
  return NextResponse.json({ track: { id: track.id, adoptedVersionId: track.adoptedVersionId } })
} catch (error) {
  if (error instanceof Error && /NOT_FOUND|ACCESS_DENIED/.test(error.message)) throw new ApiError('NOT_FOUND')
  if (error instanceof Error && /STALE|INVALID/.test(error.message)) throw new ApiError('CONFLICT')
  throw error
}
```

Submit route must validate server eligibility and snapshot configuration; track route must authorize candidate -> batch -> track -> project before adopt. No video submit route or `VGEN` Task belongs in Phase 8.

### Query hooks and Remake navigation (hook/component, request-response)

**Analogs:** `src/lib/query/hooks/useRemakeProject.ts:80-124`, `src/lib/query/mutations/remake-prompt-mutations.ts:20-54`, `src/app/[locale]/workspace/[projectId]/modes/remake/RemakeWorkbench.tsx:13-84`, `src/app/[locale]/workspace/[projectId]/modes/remake/prompt/PromptStage.tsx:55-84`.

**Refresh after mutation pattern** (`remake-prompt-mutations.ts:20-52`):
```ts
return useMutation({
  mutationFn: async (payload) => await requestJsonWithError(endpoint, { method: 'POST', body: JSON.stringify(payload) }),
  onSuccess: async () => { await refresh() },
})
```

Extend the existing snapshot type/query instead of a second endpoint cache. Add `storyboard` and `video` to the free-navigation stage registry; Prompt stage gets only an explicit navigation CTA with eligible/total count. Adoption success refetches the server snapshot, not a local optimistic pointer.

### `RemakeStoryboardStage.tsx` (component, request-response)

**Analogs:** `ImageSection.tsx:19-218`, `CandidateSelector.tsx:10-174`.

**Stable task/empty/error/card state** (`ImageSection.tsx:82-169`):
```tsx
{isSubmittingPanelImageTask ? renderLoadingState('regenerate', imageUrl)
  : candidateData ? <ImageSectionCandidateMode ... />
  : failedError ? renderFailedState()
  : imageUrl ? <MediaImageWithLoading src={imageUrl} ... />
  : renderEmptyState()}
```

**Preview selection is independent input** (`CandidateSelector.tsx:68-72, 107-110`):
```tsx
onClick={() => {
  onSelect(index + 1)
  onPreview(getImageUrl(url)!)
}}
```

**Do not copy this confirm coupling** (`CandidateSelector.tsx:139-169`):
```tsx
onClick={() => {
  setIsConfirming(true)
  onConfirm()
}}
```

Use the glass image/task primitives, stable aspect ratio, loading/error treatment, and thumbnail selection shape. Replace `onConfirm` with a distinct adoption CTA plus replacement confirmation; preserve all batches and render comparison inline. The upper original-reference row must use immutable revision frames, while only chosen eligible slots render lower generation cards.

### `RemakeVideoStage.tsx` (component, request-response)

**Analogs:** `VideoStageRoute.tsx:10-46`, `VideoPanelCardBody.tsx:76-120`.

**Route-wrapper dependency boundary** (`VideoStageRoute.tsx:10-24`):
```tsx
const runtime = useWorkspaceStageRuntime()
const { projectId, episodeId } = useWorkspaceProvider()
const { clips, storyboards, shotGroups } = useWorkspaceEpisodeStageData()
```

Do not mount this wrapper for Remake: it requires Novel Promotion Episode/Storyboard/Panel state. Build a Remake adapter shell that feeds real snapshot inputs, shared asset/config launchers, and a disabled generate callback. Reuse the card's grouped reference-preview layout (`VideoPanelCardBody.tsx:76-120`) for two explicitly labelled inputs: adopted main-frame references and the revision-bound action sheet.

## Shared Patterns

### Authorization and error mapping
**Sources:** `src/app/api/remake-projects/[projectId]/prompts/analyze/route.ts:48-77`, `src/app/api/remake-projects/[projectId]/prompts/tracks/[trackId]/route.ts:24-76`.

Every read/mutation starts with `requireProjectAuthLight(projectId)` and uses `ApiError` for invalid input, not-found/access denial, and stale/invalid conflict. Validate ownership again in the service/worker before writing.

### Immutable provenance and invalidation
**Sources:** `src/lib/remake-projects/prompt/service.ts:35-101`, `prisma/schema.prisma:553-637`.

Persist a frozen input snapshot/fingerprint, Task ID, model/capability metadata, asset references and revision identity on every batch/candidate/action-sheet result. Upstream changes create invalidation rows and never overwrite original frames or historical candidates.

### Model capability and image infrastructure
**Sources:** `src/lib/config-service.ts:193-239`, `src/lib/workers/handlers/panel-image-task-handler.ts:248-357`.

Resolve options once at submit, validate with the central resolver, and place the resolved options in Task/provenance. Workers reuse normalized reference images, gateway invocation, object storage upload and Task progress reporting.

### UI state authority
**Sources:** `src/lib/remake-projects/service.ts:150-160`, `src/app/[locale]/workspace/[projectId]/modes/novel-promotion/components/storyboard/CandidateSelector.tsx:68-72`.

Server snapshot owns selection persistence, task state, batches and adopted pointers. Component state owns only preview/comparison choice. Refresh snapshot after mutations; never infer adoption from thumbnail index or task completion.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/lib/remake-projects/keyframes/action-sheet.ts` | service | file-I/O | No inspected reusable three-frame contact-sheet renderer; implement a narrowly scoped deterministic renderer on the existing Worker/storage boundary. |
| `src/app/[locale]/workspace/[projectId]/modes/remake/storyboard/RemakeStoryboardStage.tsx` | component | request-response | Existing Storyboard entry is coupled to Novel Promotion entities; reuse lower card/presentation patterns only. |
| `src/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoStage.tsx` | component | request-response | Existing Video route wrapper is coupled to Novel Promotion runtime; build Remake adapter while retaining shared controls. |

## Metadata

**Analog search scope:** `src/lib/remake-projects`, `src/lib/task`, `src/lib/workers`, `src/app/api/remake-projects`, Remake/Novel Promotion workspace components, `prisma`, and `tests`.
**Files scanned:** 28
**Pattern extraction date:** 2026-08-10
