import React from 'react';
import { 
  Play, 
  Scissors, 
  Combine, 
  Trash2, 
  Tag, 
  Check, 
  X, 
  Clock, 
  Sliders, 
  UserCheck, 
  Sparkles,
} from 'lucide-react';
import { Shot } from '../types';
import { frameToTimecode } from '../utils/timecode';
import { ShotEditorPopover } from './ShotEditorPopover';
import { FrameSlot, KeyframeSelectorPopover } from './KeyframeSelectorPopover';

interface ShotCardProps {
  shot: Shot;
  fps: number;
  isSelected: boolean;
  viewMode: 'list' | 'grid';
  onSelect: (shot: Shot) => void;
  onPlay: (shot: Shot) => void;
  onSeekFrame: (frame: number) => void;
  onSplit: (shotId: string) => void;
  onSplitAtFrame: (shotId: string, splitFrame: number) => void;
  onUpdateShot: (shot: Shot) => void;
  totalFrames: number;
  videoUrl: string;
  onMergePrevious?: (shotId: string) => void;
  onMergeNext?: (shotId: string) => void;
  onDelete: (shotId: string) => void;
}

export const ShotCard: React.FC<ShotCardProps> = ({
  shot,
  fps,
  isSelected,
  viewMode,
  onSelect,
  onPlay,
  onSeekFrame,
  onSplit,
  onSplitAtFrame,
  onUpdateShot,
  totalFrames,
  videoUrl,
  onMergePrevious,
  onMergeNext,
  onDelete,
}) => {
  const [editorMode, setEditorMode] = React.useState<'boundary' | 'split' | null>(null);
  const [editingKeyframeSlot, setEditingKeyframeSlot] = React.useState<FrameSlot | null>(null);
  const representativeFrames = shot.keyframeFrames || {
    first: shot.startFrame,
    middle: Math.floor((shot.startFrame + shot.endFrame) / 2),
    last: shot.endFrame,
  };
  const { first: firstFrame, middle: midFrame, last: lastFrame } = representativeFrames;
  const firstTimecode = frameToTimecode(firstFrame, fps);
  const midTimecode = frameToTimecode(midFrame, fps);
  const lastTimecode = frameToTimecode(lastFrame, fps);

  // Status Badge Helper
  const getStatusBadge = () => {
    switch (shot.status) {
      case 'keep':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <Check className="w-3 h-3" />
            保留
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <Clock className="w-3 h-3" />
            待确认
          </span>
        );
      case 'discard':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
            <X className="w-3 h-3" />
            废弃
          </span>
        );
    }
  };

  // GRID VIEW CARD
  if (viewMode === 'grid') {
    return (
      <div
        onClick={() => onSelect(shot)}
        className={`group bg-slate-900 border rounded-2xl p-3 shadow-lg hover:shadow-2xl transition-all cursor-pointer flex flex-col justify-between gap-3 ${
          isSelected
            ? 'border-cyan-400 ring-2 ring-cyan-400/30'
            : 'border-slate-800 hover:border-slate-700'
        }`}
      >
        {/* Thumbnail Header */}
        <div className="relative aspect-video rounded-xl bg-slate-950 overflow-hidden">
          <img
            src={shot.middleFrameUrl}
            alt="中间帧"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded-md bg-slate-900/90 backdrop-blur-md text-xs font-bold text-slate-100 border border-slate-700">
                镜头 {String(shot.shotNumber).padStart(2, '0')}
              </span>
              {getStatusBadge()}
            </div>

            <div className="flex items-center justify-between text-[11px] font-mono font-bold text-slate-200">
              <span>⏱ {shot.startTimecode}</span>
              <span className="text-cyan-400">{shot.duration.toFixed(2)}s</span>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {shot.tags.slice(0, 2).map((tag) => (
              <span key={tag} className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlay(shot);
              }}
              className="p-1.5 bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-slate-200 rounded-lg text-xs transition-colors"
              title="预览镜头"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(shot);
                setEditorMode('boundary');
              }}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs transition-colors"
              title="编辑镜头边界"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // LIST VIEW CARD (Default specified by user)
  return (
    <div
      onClick={() => onSelect(shot)}
      className={`bg-slate-900 border rounded-2xl p-4 shadow-xl transition-all cursor-pointer flex flex-col gap-3.5 ${
        isSelected
          ? 'border-cyan-400 ring-2 ring-cyan-400/20 bg-slate-900/90'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
            镜头 {String(shot.shotNumber).padStart(2, '0')}
          </span>
          {getStatusBadge()}
          {shot.modifiedSource === 'USER' ? (
            <span className="text-[11px] text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20 flex items-center gap-1">
              <UserCheck className="w-3 h-3" />
              人工修改
            </span>
          ) : (
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              AI 识别
            </span>
          )}
        </div>

        <div className="text-xs font-mono text-slate-400 flex items-center gap-3">
          <span>起始 <strong className="text-slate-200">{shot.startTimecode}</strong></span>
          <span>结束 <strong className="text-slate-200">{shot.endTimecode}</strong></span>
          <span>时长 <strong className="text-cyan-400">{shot.duration.toFixed(3)} 秒</strong> ({shot.durationFrames} 帧)</span>
        </div>
      </div>

      {/* 3 Keyframe Thumbnails Trio */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        
        {/* First Frame (首帧) */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            setEditingKeyframeSlot('first');
          }}
          className="group relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 hover:border-cyan-500/50 transition-all cursor-pointer"
        >
          <img
            src={shot.firstFrameUrl || undefined}
            alt="首帧"
            className="w-full aspect-video object-cover group-hover:scale-105 transition-transform"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 flex items-center justify-between text-xs">
            <span className="font-bold text-cyan-400 text-[11px]">首帧</span>
            <span className="font-mono text-slate-200 text-[11px]">{firstTimecode}</span>
          </div>
        </div>

        {/* Middle Frame (中间帧) */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            setEditingKeyframeSlot('middle');
          }}
          className="group relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 hover:border-amber-500/50 transition-all cursor-pointer"
        >
          <img
            src={shot.middleFrameUrl || undefined}
            alt="中间帧"
            className="w-full aspect-video object-cover group-hover:scale-105 transition-transform"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 flex items-center justify-between text-xs">
            <span className="font-bold text-amber-400 text-[11px]">中间帧</span>
            <span className="font-mono text-slate-200 text-[11px]">{midTimecode}</span>
          </div>
        </div>

        {/* Last Frame (尾帧) */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            setEditingKeyframeSlot('last');
          }}
          className="group relative bg-slate-950 rounded-xl overflow-hidden border border-slate-800 hover:border-rose-500/50 transition-all cursor-pointer"
        >
          <img
            src={shot.lastFrameUrl || undefined}
            alt="尾帧"
            className="w-full aspect-video object-cover group-hover:scale-105 transition-transform"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 flex items-center justify-between text-xs">
            <span className="font-bold text-rose-400 text-[11px]">尾帧</span>
            <span className="font-mono text-slate-200 text-[11px]">{lastTimecode}</span>
          </div>
        </div>

      </div>

      {editingKeyframeSlot && (
        <KeyframeSelectorPopover
          shot={shot}
          fps={fps}
          videoUrl={videoUrl}
          initialSlot={editingKeyframeSlot}
          onSeekFrame={onSeekFrame}
          onUpdateShot={onUpdateShot}
          onClose={() => setEditingKeyframeSlot(null)}
        />
      )}

      {/* Footer Meta & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/60 text-xs">
        
        {/* Tags & Notes */}
        <div className="flex items-center gap-2 flex-wrap max-w-xl">
          {shot.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60 text-[11px]"
            >
              {tag}
            </span>
          ))}
          {shot.notes && (
            <span className="text-slate-400 italic text-[11px] truncate max-w-xs">
              "{shot.notes}"
            </span>
          )}
        </div>

        {/* Operation Bar */}
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay(shot);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold flex items-center gap-1 transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>预览镜头</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(shot);
              setEditorMode('boundary');
            }}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition-colors"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>编辑边界</span>
          </button>

          {onMergePrevious && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMergePrevious(shot.id);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition-colors"
              title="当前镜头并入上一个镜头，当前镜头将消失"
            >
              <Combine className="w-3.5 h-3.5 text-blue-400" />
              <span>合并到上一个</span>
            </button>
          )}

          {onMergeNext && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMergeNext(shot.id);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition-colors"
              title="当前镜头并入下一个镜头，当前镜头将消失"
            >
              <Combine className="w-3.5 h-3.5 text-blue-400" />
              <span>合并到下一个</span>
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(shot);
              setEditorMode('split');
            }}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition-colors"
            title="选择拆分帧并生成两个镜头"
          >
            <Scissors className="w-3.5 h-3.5 text-amber-400" />
            <span>拆分</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdateShot({ ...shot, status: 'keep', modifiedSource: 'USER' });
            }}
            className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1 transition-colors ${
              shot.status === 'keep'
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-slate-800 hover:bg-emerald-950 text-emerald-300 border-slate-700'
            }`}
            title="将当前镜头标记为保留"
          >
            <Check className="w-3.5 h-3.5" />
            <span>保留</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdateShot({ ...shot, status: 'discard', modifiedSource: 'USER' });
            }}
            className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1 transition-colors ${
              shot.status === 'discard'
                ? 'bg-rose-500 text-slate-950 border-rose-400'
                : 'bg-slate-800 hover:bg-rose-950 text-rose-300 border-slate-700'
            }`}
            title="将当前镜头标记为废弃"
          >
            <X className="w-3.5 h-3.5" />
            <span>废弃</span>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(shot.id);
            }}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 border border-slate-700 transition-colors"
            title="删除镜头"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>

      {editorMode && (
        <ShotEditorPopover
          shot={shot}
          fps={fps}
          totalFrames={totalFrames}
          videoUrl={videoUrl}
          mode={editorMode}
          onUpdateShot={onUpdateShot}
          onSplit={onSplitAtFrame}
          onClose={() => setEditorMode(null)}
        />
      )}

    </div>
  );
};
