# Plan 09-02 Summary: 视频版本备注、采用、失效与重新确认

## Status: completed

## What was delivered

完成了视频版本的轻量 MVP 生命周期闭环：备注、显式采用与替换、上游输入失效传播、显式重新确认。全部保持追加语义，历史版本和采用指针在任何失效/复核状态下均可追溯和播放（D-13~D-19）。

### Service layer
- `setVideoReviewNote(versionId, note)`：项目授权后更新单条版本的纯文本备注（截断 2000 字），不做结构化评分/标签/排名。
- `adoptVideoVersion(trackId, versionId, confirmReplace?)`：事务化切换采用指针，替换已有采用时必须显式 `confirmReplace`，否则抛 `REMAKE_VIDEO_REPLACE_CONFIRM_REQUIRED`；每次采用追加一条 `RemakeVideoAdoptionEvent`，记录 previous/next/reviewer/timestamp。
- `reconfirmVideoVersion(trackId, versionId)`：只允许对当前采用的失效版本执行；清除匹配的 `remake_invalidations` 记录状态为 `reconfirmed`，清掉 output 的 `invalidatedAt`，并追加一条同版本 reconfirmation adoption event 保留审计轨迹；不改变 adopted 指针。

### Invalidation propagation
- `src/lib/remake-projects/video/invalidation.ts`：`invalidateRemakeVideoVersions({ shotId, revisionId, reason })`，扫描当前 revision 所有视频批次，只要 `orderedReferences` 中包含的任一 media 已被失效（来自 keyframe/action-sheet 失效输出），就把对应视频版本标记为 `needs_review` 并写入 `remake_invalidations`。
- 已接入 `keyframes/invalidation.ts` 的 `invalidateKeyframeOutputsForRevision` 末尾：关键帧/动作表失效后自动向下传播到视频版本。
- 失效只改状态和加复核记录，不动 `adoptedVersionId`，符合 D-18。

### Track route
- `src/app/api/remake-projects/[projectId]/video/tracks/[trackId]/route.ts`：
  - GET：返回 track 详情（batches / versions / adoption events），鉴权后只看本项目。
  - POST `note`：写备注。
  - POST `adopt`：采用（带 `confirmReplace`）。
  - POST `reconfirm`：重新确认。
  - 错误映射：NOT_FOUND / CONFLICT（stale / confirm required / not adopted）。

### Snapshot projection
- `getRemakeProjectSnapshot` 在每个 Shot 的 current revision 上投影 `videoGeneration.track`：包含 track id、adoptedVersionId、hasInvalidated、按时间倒序的 batches/versions（含 mediaUrl、status、invalidated、note），和 adoption events。

## Tests
- `tests/integration/api/remake-projects-video-tracks.test.ts`：8 个（detail、note 更新与截断、首次采用无确认、替换需确认、替换通过确认、非采用版本不可重确认、重确认清除失效状态、重确认追加 event）。
- `tests/integration/remake-projects/remake-video-invalidation.test.ts`：4 个（关键帧失效传播到视频、幂等复核记录、无关 media 不失效、失效不改 adopted 指针）。

Wave 2 合计 12 个测试全过。加上 Wave 1 共 40 个测试通过，TypeScript 类型检查通过。

## Key decisions
- 备注只存简单纯文本，没有结构化评分、标签、自动排名——遵守 D-14 的轻量 MVP。
- 失效保留采用指针 + 标 `needs_review` + readiness 变 false，而不是自动撤下或自动重生成——遵守 D-17/D-18。
- 重新确认必须作用在当前采用版本上，避免用户点到非采用版本产生混乱语义。
- 失效传播写在 keyframe invalidation 末尾调用，不引入新的事件总线或依赖图，保持轻量。

## Known limitations / deferred
- UI 交互在 Wave 3 实现。
- Prompt 版本变化也应触发失效，但当前只从 keyframe/action-sheet 那条链路接入；Prompt 端的 invalidation 触发点后续再补齐（不阻塞本阶段核心路径）。
