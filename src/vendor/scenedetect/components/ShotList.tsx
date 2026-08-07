import React, { useState } from 'react';
import { 
  LayoutList, 
  LayoutGrid, 
  Search, 
  Filter, 
  CheckSquare, 
  Square, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  XCircle,
  Tag
} from 'lucide-react';
import { Shot, ShotStatus } from '../types';
import { ShotCard } from './ShotCard';

interface ShotListProps {
  shots: Shot[];
  fps: number;
  activeShotId: string | null;
  onSelectShot: (shot: Shot) => void;
  onPreviewShot: (shot: Shot) => void;
  onSeekFrame: (frame: number) => void;
  onSplitShot: (shotId: string) => void;
  onSplitShotAtFrame: (shotId: string, splitFrame: number) => void;
  onUpdateShot: (shot: Shot) => void;
  totalFrames: number;
  videoUrl: string;
  onMergeShots: (shotId1: string, shotId2: string) => void;
  onMergePrevious: (shotId: string) => void;
  onMergeNext: (shotId: string) => void;
  onDeleteShot: (shotId: string) => void;
  onBatchDelete: (shotIds: string[]) => void;
  onBatchStatusChange: (shotIds: string[], status: ShotStatus) => void;
}

export const ShotList: React.FC<ShotListProps> = ({
  shots,
  fps,
  activeShotId,
  onSelectShot,
  onPreviewShot,
  onSeekFrame,
  onSplitShot,
  onSplitShotAtFrame,
  onUpdateShot,
  totalFrames,
  videoUrl,
  onMergeShots,
  onMergePrevious,
  onMergeNext,
  onDeleteShot,
  onBatchDelete,
  onBatchStatusChange,
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ShotStatus>('all');
  const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);

  // Filter shots
  const filteredShots = shots.filter((shot) => {
    // Status filter
    if (statusFilter !== 'all' && shot.status !== statusFilter) return false;

    // Search query (shot number, tags, notes)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const matchNumber = `镜头${shot.shotNumber}`.includes(query) || `shot${shot.shotNumber}`.includes(query);
      const matchTag = shot.tags.some((t) => t.toLowerCase().includes(query));
      const matchNote = shot.notes.toLowerCase().includes(query);
      return matchNumber || matchTag || matchNote;
    }

    return true;
  });

  // Batch selection toggle
  const toggleSelectAll = () => {
    if (selectedShotIds.length === filteredShots.length) {
      setSelectedShotIds([]);
    } else {
      setSelectedShotIds(filteredShots.map((s) => s.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    if (selectedShotIds.includes(id)) {
      setSelectedShotIds(selectedShotIds.filter((i) => i !== id));
    } else {
      setSelectedShotIds([...selectedShotIds, id]);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      
      {/* Control Bar: View Mode, Search, Filter & Batch Selection */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
        
        {/* Left: View Mode & Search Input */}
        <div className="flex items-center gap-3 flex-wrap flex-1">
          
          {/* View Mode Switcher */}
          <div className="flex items-center rounded-xl bg-slate-950 p-1 border border-slate-800">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'list'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span>列表视图</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>缩略图网格</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="搜索镜头编号、标签或备注..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

        </div>

        {/* Right: Status Filter & Batch Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          
          {/* Status Filter Dropdown */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
            {(
              [
                { id: 'all', label: '全部' },
                { id: 'keep', label: '保留' },
                { id: 'pending', label: '待确认' },
                { id: 'discard', label: '废弃' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => setStatusFilter(item.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === item.id
                    ? 'bg-slate-800 text-cyan-400 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Batch Operations Bar if Items Selected */}
          {selectedShotIds.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1 text-xs">
              <span className="px-2 text-cyan-400 font-bold">
                已选 {selectedShotIds.length} 项
              </span>
              <button
                onClick={() => onBatchStatusChange(selectedShotIds, 'keep')}
                className="px-2 py-1 rounded bg-emerald-950 text-emerald-300 hover:bg-emerald-900 text-[11px]"
              >
                设为保留
              </button>
              <button
                onClick={() => onBatchStatusChange(selectedShotIds, 'discard')}
                className="px-2 py-1 rounded bg-rose-950 text-rose-300 hover:bg-rose-900 text-[11px]"
              >
                设为废弃
              </button>
              <button
                onClick={() => {
                  onBatchDelete(selectedShotIds);
                  setSelectedShotIds([]);
                }}
                className="p-1 rounded text-rose-400 hover:bg-rose-950"
                title="批量删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

        </div>

      </div>

      {/* Shots Counter & Batch Selection Checkbox */}
      <div className="flex items-center justify-between px-2 text-xs text-slate-400">
        <button
          onClick={toggleSelectAll}
          className="flex items-center gap-1.5 hover:text-slate-200 transition-colors"
        >
          {selectedShotIds.length > 0 && selectedShotIds.length === filteredShots.length ? (
            <CheckSquare className="w-4 h-4 text-cyan-400" />
          ) : (
            <Square className="w-4 h-4 text-slate-600" />
          )}
          <span>全选 ({filteredShots.length} 个镜头)</span>
        </button>

        <span>显示 {filteredShots.length} / 共 {shots.length} 个镜头</span>
      </div>

      {/* Shots List or Grid Layout */}
      {filteredShots.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-500">
          <p className="text-sm">未找到符合筛选条件的镜头</p>
        </div>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
              : 'flex flex-col gap-4'
          }
        >
          {filteredShots.map((shot, index) => {
            const isSelected = shot.id === activeShotId;
            const sourceIndex = shots.findIndex((item) => item.id === shot.id);
            const previousShot = sourceIndex > 0 ? shots[sourceIndex - 1] : null;
            const nextShot = sourceIndex < shots.length - 1 ? shots[sourceIndex + 1] : null;

            return (
              <ShotCard
                key={shot.id}
                shot={shot}
                fps={fps}
                isSelected={isSelected}
                viewMode={viewMode}
                onSelect={onSelectShot}
                onPlay={onPreviewShot}
                onSeekFrame={onSeekFrame}
                onSplit={onSplitShot}
                onSplitAtFrame={onSplitShotAtFrame}
                onUpdateShot={onUpdateShot}
                totalFrames={totalFrames}
                videoUrl={videoUrl}
                onMergePrevious={previousShot ? onMergePrevious : undefined}
                onMergeNext={nextShot ? onMergeNext : undefined}
                onDelete={onDeleteShot}
              />
            );
          })}
        </div>
      )}

    </div>
  );
};
