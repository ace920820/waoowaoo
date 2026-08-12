# Phase 9: video-generation - Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 12 anticipated new/modified files
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `prisma/schema.prisma` | model | CRUD / event-driven | `RemakeKeyframeTrack`, `RemakeKeyframeBatch`, `RemakeKeyframeCandidate`, `RemakeKeyframeAdoptionEvent` | exact lifecycle match |
| `prisma/migrations/*_add_remake_video_generation/migration.sql` | migration | transform | `20260810120000_add_remake_keyframe_generation/migration.sql` | role-match |
| `src/lib/remake-projects/video/contracts.ts` | utility / contract | transform | `src/lib/remake-projects/keyframes/contracts.ts` | exact contract match |
| `src/lib/remake-projects/video/task-contract.ts` | utility / task descriptor | request-response | `src/lib/remake-projects/keyframes/task-contract.ts` | exact |
| `src/lib/remake-projects/video/service.ts` | service | CRUD / file-I/O | `src/lib/remake-projects/keyframes/service.ts` | exact lifecycle match |
| `src/lib/remake-projects/video/invalidation.ts` | service | event-driven | `src/lib/remake-projects/keyframes/invalidation.ts` | exact |
| `src/lib/remake-projects/keyframes/video-inputs.ts` | adapter / utility | transform | same file, `mapRemakeVideoInputs` | exact extension |
| `src/lib/remake-projects/service.ts` | service / snapshot projection | CRUD / transform | `getRemakeProjectSnapshot` | exact extension |
| `src/app/api/remake-projects/[projectId]/video/route.ts` | route | request-response | `keyframes/route.ts` | exact |
| `src/app/api/remake-projects/[projectId]/video/tracks/[trackId]/route.ts` | route | request-response | `keyframes/tracks/[trackId]/route.ts` | exact |
| `src/lib/workers/handlers/remake-video.ts` and worker registration | worker | async file-I/O | `handlers/remake-keyframe-image.ts` and `video.worker.ts` | role/data-flow match |
| `src/app/[locale]/workspace/[projectId]/modes/remake/video/RemakeVideoStage.tsx` | component | event-driven / request-response | current `RemakeVideoStage.tsx`; video controls in `ShotGroupVideoSection.tsx` | exact integration / role-match controls |

## Pattern Assignments

### `prisma/schema.prisma` and migration (model, CRUD/event-driven)

**Analog:** `prisma/schema.prisma`

**Append-only batch, immutable output, explicit adoption pattern** (lines 548-750):
```prisma
model RemakeOutputVersion {
  id         String @id @default(uuid())
  shotId     String
  revisionId String?
  mediaId    String?
  kind       String @default("generated")
  fingerprint String?
  taskId     String?
  inputSnapshot Json?
  invalidatedAt DateTime?
  status     String @default("pending")
  ...
  @@unique([revisionId, kind, fingerprint])
}

model RemakeKeyframeBatch {
  trackId String
  operationKey String
  inputFingerprint String
  inputSnapshot Json
  modelId String
  modelOptions Json
  referenceMediaIds Json
  @@unique([trackId, operationKey])
}

model RemakeKeyframeAdoptionEvent {
  trackId String
  previousCandidateId String?
  nextCandidateId String?
  reviewerId String?
  createdAt DateTime @default(now())
}
```

Create video equivalents that retain the immutable task input snapshot, ordered selected references, model/reference mode/options, task ID, reviewer note, current adopted version pointer, and append-only adoption/reconfirmation events. Keep old video rows when inputs change; use a migration, never mutate historical snapshots.

### `src/lib/remake-projects/video/contracts.ts` (utility/contract, transform)

**Analog:** `src/lib/remake-projects/keyframes/contracts.ts`

**Copy the Zod schema plus deterministic fingerprint convention.** Its public types are consumed by the route, worker, persistence service, and snapshot projection. The task contract shows the required round-trip validation (below); encode references as an ordered array of `{ role, ordinal, mediaId }`, rather than an unordered media-ID set.

### `src/lib/remake-projects/video/task-contract.ts` (utility, request-response)

**Analog:** `src/lib/remake-projects/keyframes/task-contract.ts`

**Strict payload and fingerprint validation** (lines 1-47):
```typescript
const payloadSchema = z.object({
  kind: z.literal('keyframe'),
  operationKey: operationKeySchema,
  inputSnapshot: keyframeInputSnapshotSchema,
  inputFingerprint: z.string().length(64),
}).strict()

export function buildRemakeKeyframeTaskDescriptor(input: { ... }) {
  const inputSnapshot = keyframeInputSnapshotSchema.parse(input.inputSnapshot)
  assertProjectSnapshot(input.projectId, inputSnapshot)
  const inputFingerprint = keyframeInputFingerprint(inputSnapshot)
  const payload = payloadSchema.parse({ kind: 'keyframe', operationKey: input.operationKey, inputSnapshot, inputFingerprint })
  return { taskType: TASK_TYPE.REMAKE_KEYFRAME_IMAGE_GENERATE, targetType: 'remake_shot' as const, targetId: inputSnapshot.shotId, inputFingerprint, payload, dedupeKey: `remake-keyframe:${input.projectId}:${payload.operationKey}:${inputFingerprint}` }
}
```

Make the video descriptor use a new remake-video task type and a dedupe key including project, operation key, and immutable fingerprint. Keep the runtime-payload-key stripping in the parser so task UI metadata cannot invalidate a payload.

### `src/lib/remake-projects/video/service.ts` (service, CRUD/file-I/O)

**Analog:** `src/lib/remake-projects/keyframes/service.ts`

**Current-input gate before submit** (lines 19-102):
```typescript
const shot = await client.remakeShot.findFirst({
  where: { id: input.shotId, remakeProject: { projectId: input.projectId, project: { type: 'remake' } } },
  include: { remakeProject: { include: { currentSource: true } }, revisions: { where: { lifecycleState: 'active' }, orderBy: { revision: 'desc' }, take: 1 } },
})
if (!shot || !revision || !Number.isSafeInteger(sourceRevision) || !sourceRevision) throw new Error('REMAKE_KEYFRAME_INPUT_STALE')
...
const capabilityOptions = await resolveProjectModelCapabilityGenerationOptions({ projectId, userId, modelType: 'image', modelKey: resolvedModel, runtimeSelections })
```

**Immutable persistence, idempotency, and provenance** (lines 185-231):
```typescript
const existing = await tx.remakeKeyframeBatch.findUnique({ where: { trackId_operationKey: { trackId: track.id, operationKey: input.operationKey } } })
if (existing) return { batchId: existing.id, candidateIds: ... }
const batch = await tx.remakeKeyframeBatch.create({ data: {
  ...,
  inputSnapshot: JSON.parse(JSON.stringify(snapshot)),
  modelId: snapshot.model.id,
  modelOptions: JSON.parse(JSON.stringify(snapshot.options)),
  referenceMediaIds: JSON.parse(JSON.stringify(snapshot.referenceMediaIds)),
}})
await tx.remakeProvenanceRecord.create({ data: { shotId: snapshot.shotId, keyframeBatchId: batch.id, schema: 'remake-keyframe-generation@1', executor: 'image-worker', payload: JSON.stringify(...) } })
```

Build the video submission snapshot only from explicit selected adopted keyframes plus the optional action sheet, in fixed Start/Middle/End/action-sheet order. Resolve video defaults with the existing project/user config path, run `resolveProjectModelCapabilityGenerationOptions` with `modelType: 'video'`, and persist the normalized result. Re-check current revision, adopted Video Prompt, selected candidate IDs/media, and action-sheet state both at submission and immediately before persistence. Add `setVideoReviewNote`, explicit `adoptVideoVersion`, and explicit `reconfirmVideoVersion` within transactions; adoption must create an event and never occur on playback.

### `src/lib/remake-projects/video/invalidation.ts` (service, event-driven)

**Analog:** `src/lib/remake-projects/keyframes/invalidation.ts`

**Retain rows and create idempotent review records** (lines 10-63):
```typescript
const outputs = await tx.remakeOutputVersion.findMany({ where: { shotId: input.shotId, ... }, select: { id: true } })
await tx.remakeOutputVersion.updateMany({ where: { id: { in: outputs.map(...) } }, data: { invalidatedAt: new Date(), status: 'invalidated' } })
...
await tx.remakeInvalidation.create({ data: { shotId, revisionId, outputVersionId: output.id, reason, status: 'needs_review' } })
```

For video, preserve the adopted pointer and media. Mark output/invalidation as `needs_review` rather than deleting or automatically unadopting. Invoke it from the existing prompt/keyframe/revision invalidation paths whenever a selected reference, action sheet, or adopted Video Prompt becomes stale.

### `src/lib/remake-projects/keyframes/video-inputs.ts` and `src/lib/remake-projects/service.ts` (adapter/service, transform)

**Analog:** `video-inputs.ts` lines 15-35 and `service.ts` lines 95-300.

**Truthful input projection**:
```typescript
const mainImages = (['start', 'middle', 'end'] as const).filter((slot) => allowed.has(slot)).flatMap((slot) => {
  const mediaId = shot.slots[slot].adoptedCandidate?.mediaId
  return mediaId ? [{ slot, mediaId, source: 'adopted' as const }] : []
})
```

Extend this projection with explicit selectable input candidates, fixed ordinal output, prompt/version identity, original video URL, video batch/version history, current adoption, note, and review gate. Do not revive `videoSubmissionDisabled()` in the Phase 9 UI. Expand `getRemakeProjectSnapshot` includes and projection rather than introducing a second data fetch shape.

### API routes (route, request-response)

**Analog:** `src/app/api/remake-projects/[projectId]/keyframes/route.ts` lines 1-59 and `keyframes/tracks/[trackId]/route.ts` lines 1-43.

**Auth, Zod boundary, task submission, error mapping**:
```typescript
const auth = await requireProjectAuthLight(projectId)
if (isErrorResponse(auth)) return auth
const body = requestSchema.safeParse(await request.json().catch(() => null))
if (!body.success) throw new ApiError('INVALID_PARAMS', { details: 'Invalid Remake keyframe generation request' })
const submitted = await submitTask({ userId: auth.session.user.id, locale: 'zh', projectId, type: descriptor.taskType, targetType: descriptor.targetType, targetId: descriptor.targetId, payload: descriptor.payload, dedupeKey: descriptor.dedupeKey, maxAttempts: 1 })
return NextResponse.json({ taskId: submitted.taskId }, { status: 202 })
```

Use the collection route for `generate`, and the track/version route for GET, note update, adopt, and reconfirm actions. Preserve `ApiError` mappings: stale/invalid conflicts should be `CONFLICT`; inaccessible resources `NOT_FOUND`.

### `src/lib/workers/handlers/remake-video.ts` and worker registration (worker, async file-I/O)

**Analog:** `src/lib/workers/handlers/remake-keyframe-image.ts` lines 1-39.

```typescript
const payload = parseRemakeKeyframeTaskPayload(job.data.payload)
const snapshot = payload.inputSnapshot
await assertKeyframeSubmissionCurrent(snapshot)
await assertTaskActive(job, 'remake_keyframe_preflight')
const references = await resolveKeyframeReferenceStorageKeys(snapshot)
...
await assertTaskActive(job, 'remake_keyframe_persist')
return await appendKeyframeGenerationBatch({ ... })
```

Use the same preflight/persist cancellation points. Reuse video model generation, outbound-reference conversion, storage upload, task lifecycle, billing, and progress conventions from `src/lib/workers/video.worker.ts` (imports lines 1-36; shot-group generation flow lines 600-675). The handler must pass the snapshot's ordered references and normalized video parameters directly to the gateway, then append the immutable version record.

### `RemakeVideoStage.tsx` (component, event-driven/request-response)

**Analog:** current `RemakeVideoStage.tsx` lines 1-35, plus `ShotGroupVideoSection.tsx` lines 1430-1590.

**Model-change capability normalization**:
```typescript
const capabilityDefinitions = resolveEffectiveVideoCapabilityDefinitions({ ... })
generationOptions: normalizeVideoGenerationSelections({
  definitions: nextDefinitions,
  pricingTiers: selectedVideoModelOption?.pricingTiers,
  selection: { ...current.generationOptions },
})
```

Reuse the current component's Shot card/input-group layout and project media route. Replace the Phase 8 disabled placeholder with: checkboxes for eligible references, immutable fixed-order preview, capability-driven model/options controls, submit state driven by the review gate, separate native/video playback, chronological version list, note editing, explicit adopt confirmation, reconfirm action, and an expandable receipt showing frozen snapshot. Do not copy the novel page's reference auto-selection behavior.

## Shared Patterns

### Authentication and API Errors
**Source:** `src/app/api/remake-projects/[projectId]/keyframes/route.ts` lines 20-59

All Remake routes call `requireProjectAuthLight(projectId)`, return `isErrorResponse(auth)`, parse via `safeParse`, and throw `ApiError` only at the request boundary.

### Capability Validation and Model Switches
**Source:** `src/app/api/novel-promotion/[projectId]/generate-shot-group-video/route.ts` lines 112-176; `src/lib/model-capabilities/video-effective.ts` lines 170-261

Resolve a real model with `resolveModelSelection`, then call `resolveProjectModelCapabilityGenerationOptions`. Client transitions use `normalizeVideoGenerationSelections`; server remains authoritative. Apply Phase 9's duration rounding/clamping/discrete-option rule before final capability validation and snapshot persistence.

### Immutable History, Provenance, and Review
**Source:** `src/lib/remake-projects/keyframes/service.ts` lines 185-231; `src/lib/remake-projects/keyframes/invalidation.ts` lines 10-63

All generation state is append-only, snapshots are JSON-cloned into persistence, a deterministic fingerprint protects idempotency, and invalidation adds review records rather than deleting history.

### Worker Lifecycle
**Source:** `src/lib/workers/handlers/remake-keyframe-image.ts` lines 12-39

Parse contract, assert input currency, check cancellation before work and persistence, report progress, upload to managed storage, then persist transactionally.

## No Analog Found

None. The exact Remake-video domain does not yet exist, but each required behavior has a close established analog.

## Metadata

**Analog search scope:** `prisma/`, `src/lib/remake-projects/`, `src/app/api/remake-projects/`, `src/lib/workers/`, `src/lib/shot-group/`, `src/lib/model-capabilities/`, `src/app/[locale]/workspace/[projectId]/modes/`
**Files scanned:** 18
**Pattern extraction date:** 2026-08-12
