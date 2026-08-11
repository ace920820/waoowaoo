import React, { useRef } from 'react';
import { 
  Scissors, 
  Combine, 
  Trash2, 
  Sparkles, 
  UserCheck, 
  Clock, 
  Layers,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Shot, VideoMetadata } from '../types';

interface TimelineProps {
  metadata: VideoMetadata | null;
  shots: Shot[];
  activeShotId: string | null;
  currentFrame: number;
  onSelectShot: (shot: Shot) => void;
  onSeekFrame: (frame: number) => void;
  onSplitShot: (shotId: string, splitFrame: number) => void;
  onMergeIntoNext: (shotId: string) => void;
  onDeleteShot: (shotId: string) => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  metadata,
  shots,
  activeShotId,
  currentFrame,
  onSelectShot,
  onSeekFrame,
  onSplitShot,
  onMergeIntoNext,
  onDeleteShot,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const totalFrames = metadata?.totalFrames || 1;
  const fps = metadata?.fps || 30;

  // Calculate playhead left percentage
  const playheadPercent = Math.min(100, Math.max(0, (currentFrame / totalFrames) * 100));

  // Handle timeline track scrubbing click
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || totalFrames <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetFrame = Math.round(ratio * totalFrames);
    onSeekFrame(targetFrame);
  };

  // Find active shot index
  const activeShotIndex = shots.findIndex((s) => s.id === activeShotId);
  const activeShot = activeShotIndex >= 0 ? shots[activeShotIndex] : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-3">
      {/* Timeline Header & Quick Operations */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-bold text-slate-100">可视化镜头时间轴</h2>
          <span className="text-xs text-slate-400">
            (包含 {shots.length} 个镜头区段, 按比例分布)
          </span>
        </div>

        {/* Quick Contextual Operations */}
        <div className="flex items-center gap-2 text-xs">
          {/* Split at playhead */}
          <button
            onClick={() => {
              if (activeShot && currentFrame > activeShot.startFrame && currentFrame < activeShot.endFrame) {
                onSplitShot(activeShot.id, currentFrame);
              }
            }}
            disabled={!activeShot || currentFrame <= activeShot.startFrame || currentFrame >= activeShot.endFrame}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
            title="在播放指针处切分镜头"
          >
            <Scissors className="w-3.5 h-3.5 text-amber-400" />
            <span>拆分当前镜头</span>
          </button>

          {/* Merge with Next */}
          <button
            onClick={() => {
              if (activeShotIndex >= 0 && activeShotIndex < shots.length - 1) {
                onMergeIntoNext(shots[activeShotIndex].id);
              }
            }}
            disabled={activeShotIndex < 0 || activeShotIndex >= shots.length - 1}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors"
            title="当前镜头将并入下一个镜头，当前镜头随后消失"
          >
            <Combine className="w-3.5 h-3.5 text-cyan-400" />
            <span>合并到下一镜头</span>
          </button>

          {/* Delete active shot */}
          <button
            onClick={() => activeShot && onDeleteShot(activeShot.id)}
            disabled={!activeShot}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/40 hover:text-rose-400 disabled:opacity-40 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
            title="删除选中镜头"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>删除</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Timeline Canvas Track */}
      <div className="relative pt-6 pb-2">
        
        {/* Playhead Time Ruler Labels */}
        <div className="absolute top-0 left-0 right-0 h-5 flex justify-between text-[10px] font-mono text-slate-500 pointer-events-none select-none">
          <span>00:00.000</span>
          <span>{metadata && typeof metadata.duration === 'number' ? (metadata.duration / 2).toFixed(1) + 's' : '00:30.000'}</span>
          <span>{metadata && typeof metadata.duration === 'number' ? metadata.duration.toFixed(1) + 's' : '01:00.000'}</span>
        </div>

        {/* Timeline Bar Container */}
        <div
          ref={containerRef}
          onClick={handleTrackClick}
          className="relative h-16 w-full bg-slate-950 rounded-xl border border-slate-800 overflow-hidden cursor-pointer flex items-stretch select-none shadow-inner"
        >
          {/* Render Shot Blocks */}
          {shots.map((shot, idx) => {
            const widthPercent = (shot.durationFrames / totalFrames) * 100;
            const isSelected = shot.id === activeShotId;
            const isUserModified = shot.modifiedSource === 'USER';

            let bgColor = 'bg-slate-800/80 border-slate-700';
            let textColor = 'text-slate-300';

            if (shot.status === 'keep') {
              bgColor = 'bg-emerald-950/60 border-emerald-600/50 hover:bg-emerald-900/80';
              textColor = 'text-emerald-300';
            } else if (shot.status === 'pending') {
              bgColor = 'bg-amber-950/60 border-amber-600/50 hover:bg-amber-900/80';
              textColor = 'text-amber-300';
            } else if (shot.status === 'discard') {
              bgColor = 'bg-rose-950/40 border-rose-800/40 hover:bg-rose-900/60 opacity-60';
              textColor = 'text-rose-300';
            }

            if (isSelected) {
              bgColor += ' ring-2 ring-cyan-400 shadow-lg shadow-cyan-500/20 z-10';
            }

            return (
              <div
                key={shot.id}
                style={{ width: `${Math.max(0.5, widthPercent)}%` }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectShot(shot);
                  onSeekFrame(shot.startFrame);
                }}
                className={`relative border-r border-slate-900 transition-all p-1.5 flex flex-col justify-between group cursor-pointer ${bgColor}`}
              >
                {/* Header: Shot Number & User Modified Icon */}
                <div className="flex items-center justify-between text-[11px] font-bold tracking-tight truncate">
                  <span className={textColor}>
                    #{String(shot.shotNumber).padStart(2, '0')}
                  </span>
                  {isUserModified && (
                    <span
                      title="人工已修正边界/属性"
                      className="inline-flex items-center px-1 rounded bg-indigo-500/30 text-indigo-300 text-[9px] font-medium"
                    >
                      <UserCheck className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>

                {/* Footer Duration */}
                <div className="text-[10px] font-mono text-slate-400 group-hover:text-slate-200 truncate">
                  {shot.duration.toFixed(1)}s
                </div>

                {/* Hover Quick Tooltip */}
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:flex flex-col gap-1 bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 shadow-2xl z-40 whitespace-nowrap pointer-events-none">
                  <div className="flex items-center justify-between gap-3 font-bold border-b border-slate-800 pb-1">
                    <span>镜头 {String(shot.shotNumber).padStart(2, '0')}</span>
                    <span className="text-cyan-400">{shot.duration.toFixed(2)}s ({shot.durationFrames} 帧)</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400">
                    起止: {shot.startTimecode} ➔ {shot.endTimecode}
                  </div>
                  {shot.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {shot.tags.map((t) => (
                        <span key={t} className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Interactive Playhead Line */}
          <div
            style={{ left: `${playheadPercent}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-30 pointer-events-none transition-all shadow-[0_0_12px_rgba(34,211,238,0.8)]"
          >
            <div className="absolute -top-2 -left-1.5 w-3 h-3 bg-cyan-400 rotate-45 rounded-sm shadow-md"></div>
          </div>

        </div>

      </div>

      {/* Legend & Status Color Code */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500/80 border border-emerald-400"></span>
            <span>保留 (Keep)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-amber-500/80 border border-amber-400"></span>
            <span>待确认 (Pending)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-rose-500/50 border border-rose-400"></span>
            <span>废弃 (Discard)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded ring-2 ring-cyan-400 bg-slate-800"></span>
            <span>当前选中镜头</span>
          </span>
        </div>

        <div className="text-[11px] text-slate-500 font-mono">
          拖动或点击时间轴可实时跳转视频帧
        </div>
      </div>
    </div>
  );
};
