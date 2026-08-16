'use client'

import React, { useMemo } from 'react'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { RemakeSnapshot } from '@/lib/query/hooks/useRemakeProject'
import type { UnitMemberKeyframeOption, UnitMemberView } from '@/lib/remake-projects/unit/adapter'
import {
  ACTION_SHEET_GRID_MAX_CELLS,
  type ActionSheetGridSlot,
} from '@/lib/remake-projects/unit/action-sheet-layout'

/**
 * Phase 09.3: 拖拽工作台 —— 引用槽（关键帧引用）+ 素材抽屉 + 动作表 x 宫格。
 *
 * - 素材抽屉：按镜头分组（原始帧 首/中/尾 + 已采用关键帧 start/middle/end）。
 * - 引用槽（Dock）：成员序排列；拖素材（已采用）入槽 = 换该成员引用关键帧；
 *   槽间拖拽 = 重排成员顺序。
 * - 宫格编辑器：默认 3×3（自动填充成员原始关键帧）；素材拖入替换格子；
 *   格子间拖拽重排；拖到删除区移除；可调列数/格数/自动填充/清空。
 */

export type UnitDragAsset = {
  id: string
  mediaId: string
  mediaUrl: string
  shotNumber: number
  slot: ActionSheetGridSlot
  kind: 'original' | 'adopted'
  label: string
}

export type UnitGridCellDraft = {
  id: string
  shotNumber: number
  slot: ActionSheetGridSlot
  mediaId: string
  mediaUrl: string
}

export type UnitGridDraft = {
  columns: number
  cells: UnitGridCellDraft[]
}

export type UnitReferenceDockSlot = {
  shotRevisionId: string
  shotNumber: number
  durationSeconds: number
  activeSlot: ActionSheetGridSlot
  /** 镜头原始中间帧缩略图（顺序条展示用） */
  thumbMediaUrl: string | null
  refMediaUrl: string | null
  options: UnitMemberKeyframeOption[]
}

type WorkbenchProps = {
  assets: UnitDragAsset[]
  dockSlots: UnitReferenceDockSlot[]
  grid: UnitGridDraft
  onGridChange: (grid: UnitGridDraft) => void
  /** 引用槽拖拽重排（新顺序的 shotRevisionId 数组） */
  onReorderDock: (ordered: string[]) => void
  /** 素材拖入引用槽（仅已采用）→ 设置该成员 keyframeSlot */
  onSlotAssetDrop: (shotRevisionId: string, slot: ActionSheetGridSlot) => void
  /** 动作参考表实时预览 URL（服务端按当前草稿合成，不持久化）；null = 不显示 */
  previewUrl?: string | null
  readOnly?: boolean
}

const SLOT_LABEL: Record<ActionSheetGridSlot, string> = { start: '首', middle: '中', end: '尾' }
const ASSET_ID_PREFIX = 'asset:'
const DOCK_PREFIX = 'dock:'
const CELL_PREFIX = 'cell:'

function useSortableCell(id: string, disabled: boolean, data: Record<string, unknown>) {
  const sortable = useSortable({ id, disabled, data })
  return {
    ...sortable,
    style: {
      transform: CSS.Transform.toString(sortable.transform),
      transition: sortable.transition,
    } as React.CSSProperties,
  }
}

function AssetCard({ asset }: { asset: UnitDragAsset }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${ASSET_ID_PREFIX}${asset.id}`,
    data: { kind: 'asset', mediaId: asset.mediaId, mediaUrl: asset.mediaUrl, shotNumber: asset.shotNumber, slot: asset.slot, assetKind: asset.kind, label: asset.label },
  })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid={`drag-asset-${asset.id}`}
      className={`flex w-20 shrink-0 cursor-grab flex-col overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 transition-opacity ${
        isDragging ? 'opacity-40' : 'hover:border-zinc-500'
      }`}
    >
      {asset.mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.mediaUrl} alt={asset.label} className="h-11 w-full object-cover" />
      ) : (
        <div className="flex h-11 w-full items-center justify-center bg-zinc-950 text-[9px] text-zinc-700">缺失</div>
      )}
      <span className="truncate px-1 py-0.5 text-[9px] leading-tight text-zinc-400">{asset.label}</span>
    </div>
  )
}

/** 顺序徽标：1 → ① … 9 → ⑨（>9 用 #N） */
function orderBadge(order: number): string {
  const digits = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨']
  return order <= digits.length ? digits[order - 1]! : `#${order}`
}

function ShotOrderRow({
  slot,
  order,
  readOnly,
}: {
  slot: UnitReferenceDockSlot
  order: number
  readOnly: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortableCell(
    `${DOCK_PREFIX}${slot.shotRevisionId}`,
    readOnly,
    { kind: 'dock-slot' },
  )
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid={`shot-order-row-${slot.shotRevisionId}`}
      data-order={order}
      className={`flex cursor-grab items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 transition-colors ${
        isDragging ? 'opacity-50 ring-1 ring-violet-500/50' : 'hover:border-zinc-600'
      }`}
      style={{ transform: CSS.Transform.toString(transform) || undefined, transition }}
    >
      <span
        data-testid={`shot-order-badge-${order}`}
        className="w-6 shrink-0 text-center text-sm text-violet-300"
      >
        {orderBadge(order)}
      </span>
      {slot.thumbMediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={slot.thumbMediaUrl} alt={`镜头${slot.shotNumber}`} className="h-9 w-14 shrink-0 rounded object-cover" />
      ) : (
        <div className="flex h-9 w-14 shrink-0 items-center justify-center rounded bg-zinc-950 text-[9px] text-zinc-700">
          无帧
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-zinc-200">镜头{slot.shotNumber}</p>
        <p className="text-[10px] text-zinc-500">{slot.durationSeconds.toFixed(1)}s</p>
      </div>
      {/* 当前引用关键帧（拖入已采用素材 = 换引用） */}
      <div className="flex shrink-0 items-center gap-1.5">
        {slot.refMediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={slot.refMediaUrl} alt="引用关键帧" className="h-8 w-12 rounded object-cover" />
        ) : (
          <div className="flex h-8 w-12 items-center justify-center rounded bg-zinc-950 text-[9px] text-zinc-700">
            无引用
          </div>
        )}
        <span className="rounded bg-zinc-800 px-1 py-0.5 text-[9px] text-zinc-400">{slot.activeSlot}</span>
      </div>
    </div>
  )
}

function GridCellView({
  cell,
  index,
  readOnly,
  onRemove,
}: {
  cell: UnitGridCellDraft | null
  index: number
  readOnly: boolean
  onRemove?: (index: number) => void
}) {
  const id = cell ? `${CELL_PREFIX}${cell.id}` : `${CELL_PREFIX}empty-${index}`
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortableCell(
    id,
    readOnly || !cell,
    { kind: 'grid-cell' },
  )
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `${id}:drop`, disabled: readOnly })
  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        setDropRef(node)
      }}
      {...attributes}
      {...listeners}
      data-testid={`grid-cell-${index}`}
      data-filled={cell ? 'true' : 'false'}
      className={`relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border ${
        isDragging
          ? 'opacity-50'
          : isOver
            ? 'border-violet-500/70 bg-violet-500/10'
            : cell
              ? 'border-zinc-700 bg-zinc-900'
              : 'border-dashed border-zinc-800 bg-zinc-950/40'
      }`}
      style={{ transform: CSS.Transform.toString(transform) || undefined, transition }}
    >
      {cell ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cell.mediaUrl} alt={`镜头${cell.shotNumber} ${cell.slot}`} className="h-full w-full object-cover" />
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1 py-0.5 text-[9px] text-zinc-100">
            镜头{cell.shotNumber}·{SLOT_LABEL[cell.slot]}
          </span>
          {!readOnly && onRemove && (
            <button
              type="button"
              data-testid={`grid-cell-remove-${index}`}
              onClick={() => onRemove(index)}
              className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-black/70 text-[10px] text-zinc-300 hover:text-white"
              aria-label="移除该格"
            >
              ×
            </button>
          )}
        </>
      ) : (
        <span className="text-[10px] text-zinc-700">空格</span>
      )}
    </div>
  )
}

function TrashZone({ readOnly }: { readOnly: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash', disabled: readOnly })
  return (
    <div
      ref={setNodeRef}
      data-testid="grid-trash"
      className={`flex items-center justify-center rounded-lg border border-dashed px-3 py-1.5 text-[10px] transition-colors ${
        isOver ? 'border-red-500/60 bg-red-500/10 text-red-300' : 'border-zinc-800 text-zinc-600'
      }`}
    >
      拖到这里移除格子
    </div>
  )
}

/** 自动填充顺序说明（编辑模式下显示在宫格下方）。 */
function AutoFillHint() {
  return (
    <p className="text-[10px] leading-relaxed text-zinc-600" data-testid="auto-fill-hint">
      自动填充按成员顺序（引用顺序）排列每个镜头的原始关键帧；
      格子顺序与镜头编号不一致属正常（引用顺序 = 创建 unit 时的勾选顺序），可拖拽调整。
    </p>
  )
}

/**
 * 拖拽工作台主体（编辑模式）。
 */
export function UnitDragWorkbench({
  assets,
  dockSlots,
  grid,
  onGridChange,
  onReorderDock,
  onSlotAssetDrop,
  previewUrl = null,
  readOnly = false,
}: WorkbenchProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const groupedAssets = useMemo(() => {
    const groups = new Map<number, UnitDragAsset[]>()
    for (const asset of assets) {
      const list = groups.get(asset.shotNumber) ?? []
      list.push(asset)
      groups.set(asset.shotNumber, list)
    }
    return [...groups.entries()].sort(([a], [b]) => a - b)
  }, [assets])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const activeData = active.data.current as Record<string, unknown> | undefined
    const overId = String(over.id)

    if (activeData?.kind === 'asset') {
      const asset = activeData as unknown as UnitDragAsset & { kind: string }
      if (overId.startsWith(DOCK_PREFIX) && asset.kind === 'adopted') {
        onSlotAssetDrop(overId.slice(DOCK_PREFIX.length), asset.slot)
        return
      }
      if (overId.startsWith(CELL_PREFIX)) {
        const target = overId.slice(CELL_PREFIX.length)
        if (target.startsWith('empty-')) {
          const index = Number(target.slice('empty-'.length))
          const next = [...grid.cells]
          next[index] = {
            id: asset.id,
            shotNumber: asset.shotNumber,
            slot: asset.slot,
            mediaId: asset.mediaId,
            mediaUrl: asset.mediaUrl,
          }
          onGridChange({ ...grid, cells: next })
        } else {
          const index = grid.cells.findIndex((cell) => cell.id === target)
          if (index >= 0) {
            const next = [...grid.cells]
            next[index] = {
              id: asset.id,
              shotNumber: asset.shotNumber,
              slot: asset.slot,
              mediaId: asset.mediaId,
              mediaUrl: asset.mediaUrl,
            }
            onGridChange({ ...grid, cells: next })
          }
        }
        return
      }
      return
    }

    if (activeData?.kind === 'dock-slot') {
      const ordered = resolveShotOrderDrag(dockSlots, String(active.id), overId)
      if (ordered) onReorderDock(ordered)
      return
    }

    if (activeData?.kind === 'grid-cell') {
      if (overId === 'trash') {
        const index = grid.cells.findIndex((cell) => `${CELL_PREFIX}${cell.id}` === active.id)
        if (index >= 0) {
          const next = [...grid.cells]
          next.splice(index, 1)
          onGridChange({ ...grid, cells: next })
        }
        return
      }
      if (overId.startsWith(CELL_PREFIX)) {
        const from = grid.cells.findIndex((cell) => `${CELL_PREFIX}${cell.id}` === active.id)
        const targetId = overId.slice(CELL_PREFIX.length)
        const to = targetId.startsWith('empty-')
          ? Number(targetId.slice('empty-'.length))
          : grid.cells.findIndex((cell) => cell.id === targetId)
        if (from >= 0 && to >= 0 && from !== to) {
          onGridChange({ ...grid, cells: arrayMove(grid.cells, from, to) })
        }
      }
    }
  }

  const cellIds = Array.from(
    { length: Math.max(grid.cells.length, grid.columns * 3) },
    (_, index) => (grid.cells[index] ? `${CELL_PREFIX}${grid.cells[index]!.id}` : `${CELL_PREFIX}empty-${index}`),
  )

  return (
    <div className="space-y-4" data-testid="unit-drag-workbench">
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        {/* 镜头顺序条（= 成员顺序 = 视频镜头出现顺序 / 引用顺序 / 时间锚点顺序） */}
        <div data-testid="shot-order-list">
          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
            镜头顺序（拖拽整行调整 = 视频中镜头出现顺序；拖入已采用关键帧 = 换该镜头引用图）
          </p>
          <SortableContext items={dockSlots.map((slot) => `${DOCK_PREFIX}${slot.shotRevisionId}`)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {dockSlots.map((slot, index) => (
                <ShotOrderRow key={slot.shotRevisionId} slot={slot} order={index + 1} readOnly={readOnly} />
              ))}
            </div>
          </SortableContext>
          <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-600" data-testid="shot-order-hint">
            顺序 = 引用顺序 / 提示词时间锚点顺序（0-1s 镜头①…）/ 动作表自动填充顺序；调整后点「保存成员与动作表布局」生效。
          </p>
        </div>

        {/* 素材抽屉 */}
        <div data-testid="asset-drawer">
          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-zinc-500">
            素材抽屉（原始帧 首/中/尾 + 已采用关键帧 —— 拖入镜头顺序条换引用，或拖入宫格）
          </p>
          <div className="flex flex-wrap gap-2">
            {groupedAssets.map(([shotNumber, list]) => (
              <div key={shotNumber} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2">
                <p className="mb-1 text-[10px] text-zinc-500">镜头{shotNumber}</p>
                <div className="flex gap-1.5">
                  {list.map((asset) => (
                    <AssetCard key={asset.id} asset={asset} />
                  ))}
                </div>
              </div>
            ))}
            {assets.length === 0 && (
              <p className="text-[10px] text-zinc-600">素材缺失（镜头无原始帧或已采用关键帧）</p>
            )}
          </div>
        </div>

        {/* 动作表 x 宫格 */}
        <div data-testid="action-sheet-grid-editor">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">
              动作表 x 宫格（{grid.cells.length} 格 · {grid.columns} 列）
            </p>
            <div className="flex items-center gap-2 text-[10px] text-zinc-400">
              {!readOnly && (
                <>
                  <label className="flex items-center gap-1">
                    列数
                    <select
                      data-testid="grid-columns-select"
                      value={grid.columns}
                      onChange={(event) => onGridChange({ ...grid, columns: Number(event.target.value) })}
                      className="rounded border border-zinc-800 bg-zinc-950 px-1 py-0.5 text-[10px]"
                    >
                      {[2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    data-testid="grid-auto-fill"
                    title="按成员顺序（引用顺序）填充每个镜头的原始关键帧；最多 16 格"
                    onClick={() => onGridChange({ ...grid, cells: autoFillCells(assets) })}
                    className="rounded border border-zinc-800 px-1.5 py-0.5 hover:border-zinc-600"
                  >
                    自动填充
                  </button>
                  <button
                    type="button"
                    data-testid="grid-clear"
                    onClick={() => onGridChange({ ...grid, cells: [] })}
                    className="rounded border border-zinc-800 px-1.5 py-0.5 hover:border-zinc-600"
                  >
                    清空
                  </button>
                </>
              )}
            </div>
          </div>
          <SortableContext items={cellIds} strategy={verticalListSortingStrategy}>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${grid.columns}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: Math.max(grid.cells.length, grid.columns * 3) }, (_, index) => {
                const cell = grid.cells[index] ?? null
                return (
                  <GridCellView
                    key={cell?.id ?? `empty-${index}`}
                    cell={cell}
                    index={index}
                    readOnly={readOnly}
                    onRemove={(cellIndex) => {
                      const next = [...grid.cells]
                      next.splice(cellIndex, 1)
                      onGridChange({ ...grid, cells: next })
                    }}
                  />
                )
              })}
            </div>
          </SortableContext>
          {!readOnly && <div className="mt-2"><TrashZone readOnly={readOnly} /></div>}
          {!readOnly && <div className="mt-1.5"><AutoFillHint /></div>}
        </div>

        {/* 动作参考表实时预览（Phase 09.3：保存布局/生成前即可看到合成效果） */}
        {previewUrl && (
          <div
            data-testid="action-sheet-live-preview"
            className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
          >
            <p className="mb-2 text-[10px] uppercase tracking-wide text-zinc-500">
              动作参考表实时预览（生成视频时将按此布局合成一张大图）
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="动作参考表预览"
              className="max-h-72 w-full rounded object-contain"
            />
            <a
              href={previewUrl}
              download="动作参考表.jpg"
              data-testid="action-sheet-preview-download"
              className="mt-2 inline-block rounded bg-zinc-800 px-2.5 py-1 text-[10px] text-zinc-200 hover:bg-zinc-700"
            >
              下载这张动作参考表
            </a>
          </div>
        )}
      </DndContext>
    </div>
  )
}

/** 自动填充：按素材序（成员序）取原始帧填充格子（最多 9 格）。 */
/**
 * 镜头顺序条拖拽解析（纯函数）：返回重排后的 shotRevisionId 顺序；
 * 无效目标/同位置返回 null（不触发重排）。
 */
export function resolveShotOrderDrag(
  dockSlots: UnitReferenceDockSlot[],
  activeId: string,
  overId: string,
): string[] | null {
  if (!overId.startsWith(DOCK_PREFIX)) return null
  const from = dockSlots.findIndex((slot) => `${DOCK_PREFIX}${slot.shotRevisionId}` === activeId)
  const to = dockSlots.findIndex((slot) => `${DOCK_PREFIX}${slot.shotRevisionId}` === overId)
  if (from < 0 || to < 0 || from === to) return null
  return arrayMove(dockSlots, from, to).map((slot) => slot.shotRevisionId)
}

/** 自动填充：按成员顺序（引用顺序）取每镜头原始帧填充格子。
 * 格数上限 = 布局上限（16 格）：4 个镜头（12 帧）可全量填充，
 * 5 个镜头以上才截断（超出部分不会自动加入）。
 */
export function autoFillCells(assets: UnitDragAsset[]): UnitGridCellDraft[] {
  const originals = assets.filter((asset) => asset.kind === 'original')
  const adopted = assets.filter((asset) => asset.kind === 'adopted')
  const ordered = [...originals, ...adopted]
  return ordered.slice(0, ACTION_SHEET_GRID_MAX_CELLS).map((asset) => ({
    id: asset.id,
    shotNumber: asset.shotNumber,
    slot: asset.slot,
    mediaId: asset.mediaId,
    mediaUrl: asset.mediaUrl,
  }))
}

/** 从快照解析素材列表（panel 调用）：每成员镜头 3 原始帧 + 3 已采用关键帧。 */
export function buildUnitDragAssets(
  snapshot: RemakeSnapshot,
  members: UnitMemberView[],
): UnitDragAsset[] {
  const assets: UnitDragAsset[] = []
  for (const member of members) {
    const shot = snapshot.shots.find((entry) => entry.id === member.shotId)
    const shotNumber = member.sequence ?? member.ordinal
    const keyframes = shot?.keyframes
    const slots: ActionSheetGridSlot[] = ['start', 'middle', 'end']
    for (const slot of slots) {
      const frame = keyframes?.[slot]
      if (frame?.mediaUrl) {
        assets.push({
          id: `original:${member.shotRevisionId}:${slot}`,
          mediaId: frame.mediaId ?? slot,
          mediaUrl: frame.mediaUrl,
          shotNumber,
          slot,
          kind: 'original',
          label: `镜头${shotNumber}·${SLOT_LABEL[slot]}帧`,
        })
      }
    }
    for (const option of member.keyframeOptions) {
      if (option.mediaUrl) {
        assets.push({
          id: `adopted:${member.shotRevisionId}:${option.slot}`,
          mediaId: option.mediaId ?? option.slot,
          mediaUrl: option.mediaUrl,
          shotNumber,
          slot: option.slot,
          kind: 'adopted',
          label: `镜头${shotNumber}·已采用${SLOT_LABEL[option.slot]}`,
        })
      }
    }
  }
  return assets
}
