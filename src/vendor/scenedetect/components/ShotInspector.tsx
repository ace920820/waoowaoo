import React, { useState, useEffect } from 'react';
import { 
  Play, 
  Tag, 
  Check, 
  X, 
  Plus, 
  FileText, 
  Clock, 
  Scissors, 
  Combine, 
  Trash2, 
  Sliders, 
  Sparkles, 
  UserCheck, 
  RotateCcw,
  Maximize2
} from 'lucide-react';
import { Shot, ShotStatus } from '../types';
import { frameToTimecode } from '../utils/timecode';
import { FrameSlot, KeyframeSelectorPopover } from './KeyframeSelectorPopover';

interface ShotInspectorProps {
  shot: Shot | null;
  fps: number;
  totalFrames: number;
  currentFrame: number;
  videoUrl: string;
  onUpdateShot: (updatedShot: Shot) => void;
  onPlayShot: (shot: Shot) => void;
  onSeekFrame: (frame: number) => void;
  onSplitShot: (shotId: string, splitFrame: number) => void;
  onMergeShots: (shotId1: string, shotId2: string) => void;
  onDeleteShot: (shotId: string) => void;
  onClose?: () => void;
}

const PRESET_TAGS = ['全景', '特写', '中景', '摇镜', '推镜头', '拉镜头', '人物', '空镜', '特效', '废镜头'];

export const ShotInspector: React.FC<ShotInspectorProps> = ({
  shot,
  fps,
  totalFrames,
  currentFrame,
  videoUrl,
  onUpdateShot,
  onPlayShot,
  onSeekFrame,
  onSplitShot,
  onMergeShots,
  onDeleteShot,
  onClose,
}) => {
  const [editingKeyframeSlot, setEditingKeyframeSlot] = useState<FrameSlot | null>(null);

  if (!shot) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center text-slate-500 flex flex-col items-center justify-center h-full min-h-[300px]">
        <Sliders className="w-10 h-10 text-slate-700 mb-3" />
        <p className="text-sm font-medium text-slate-400">点击时间轴或列表中任意镜头</p>
        <p className="text-xs text-slate-600 mt-1">即可在此进行首/中/尾帧预览与精细化帧边界调整</p>
      </div>
    );
  }

  const [newTagInput, setNewTagInput] = useState('');
  const [showTagAdd, setShowTagAdd] = useState(false);

  // Frame boundary modification
  const handleStartFrameChange = (newStartFrame: number) => {
    const validFrame = Math.max(0, Math.min(newStartFrame, shot.endFrame - 1));
    const startTimecode = frameToTimecode(validFrame, fps);
    const durationFrames = shot.endFrame - validFrame + 1;
    const duration = durationFrames / fps;

    onUpdateShot({
      ...shot,
      startFrame: validFrame,
      startTimecode,
      duration,
      durationFrames,
      modifiedSource: 'USER',
    });
  };

  const handleEndFrameChange = (newEndFrame: number) => {
    const validFrame = Math.min(totalFrames || 999999, Math.max(newEndFrame, shot.startFrame + 1));
    const endTimecode = frameToTimecode(validFrame, fps);
    const durationFrames = validFrame - shot.startFrame + 1;
    const duration = durationFrames / fps;

    onUpdateShot({
      ...shot,
      endFrame: validFrame,
      endTimecode,
      duration,
      durationFrames,
      modifiedSource: 'USER',
    });
  };

  // Status change
  const handleStatusChange = (status: ShotStatus) => {
    onUpdateShot({
      ...shot,
      status,
      modifiedSource: 'USER',
    });
  };

  // Tag operations
  const handleAddTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim();
    if (!trimmed || shot.tags.includes(trimmed)) return;
    onUpdateShot({
      ...shot,
      tags: [...shot.tags, trimmed],
      modifiedSource: 'USER',
    });
    setNewTagInput('');
    setShowTagAdd(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateShot({
      ...shot,
      tags: shot.tags.filter((t) => t !== tagToRemove),
      modifiedSource: 'USER',
    });
  };

  // Notes update
  const handleNotesChange = (notes: string) => {
    onUpdateShot({
      ...shot,
      notes,
      modifiedSource: 'USER',
    });
  };

  // Reset boundaries back to AI raw
  const handleResetBoundaries = () => {
    const startTimecode = frameToTimecode(shot.rawStartFrame, fps);
    const endTimecode = frameToTimecode(shot.rawEndFrame, fps);
    const durationFrames = shot.rawEndFrame - shot.rawStartFrame + 1;
    const duration = durationFrames / fps;

    onUpdateShot({
      ...shot,
      startFrame: shot.rawStartFrame,
      endFrame: shot.rawEndFrame,
      startTimecode,
      endTimecode,
      duration,
      durationFrames,
      modifiedSource: 'AI',
    });
  };

  const rawStartTimecode = frameToTimecode(shot.rawStartFrame, fps);
  const rawEndTimecode = frameToTimecode(shot.rawEndFrame, fps);
  const representativeFrames = shot.keyframeFrames || {
    first: shot.startFrame,
    middle: Math.floor((shot.startFrame + shot.endFrame) / 2),
    last: shot.endFrame,
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-5 text-slate-100">
      
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 font-bold text-sm border border-cyan-500/40">
            镜头 {String(shot.shotNumber).padStart(2, '0')}
          </div>
          {shot.modifiedSource === 'USER' ? (
            <span className="inline-flex items-center gap-1 text-xs text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/30 font-medium">
              <UserCheck className="w-3 h-3" />
              人工已修改
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              AI边界检测
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onPlayShot(shot)}
            className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-md"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>播放镜头</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 3 Keyframes Display Trio */}
      <div>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          <span>三帧代表图 (首帧 · 中间帧 · 尾帧)</span>
        </h3>
        <div className="grid grid-cols-3 gap-2.5">
          
          {/* First Frame */}
          <div
            onClick={() => setEditingKeyframeSlot('first')}
            className="group relative bg-slate-950 rounded-xl border border-slate-800 overflow-hidden cursor-pointer hover:border-cyan-500/60 transition-all shadow-md"
          >
            <img
              src={shot.firstFrameUrl}
              alt="首帧"
              className="w-full aspect-video object-cover group-hover:scale-105 transition-transform"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90 p-2 flex flex-col justify-end">
              <span className="text-[10px] font-bold text-cyan-400">首帧</span>
              <span className="text-[10px] font-mono text-slate-300">{frameToTimecode(representativeFrames.first, fps)}</span>
            </div>
          </div>

          {/* Middle Frame */}
          <div
            onClick={() => setEditingKeyframeSlot('middle')}
            className="group relative bg-slate-950 rounded-xl border border-slate-800 overflow-hidden cursor-pointer hover:border-cyan-500/60 transition-all shadow-md"
          >
            <img
              src={shot.middleFrameUrl}
              alt="中间帧"
              className="w-full aspect-video object-cover group-hover:scale-105 transition-transform"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90 p-2 flex flex-col justify-end">
              <span className="text-[10px] font-bold text-amber-400">中间帧</span>
              <span className="text-[10px] font-mono text-slate-300">
                {frameToTimecode(representativeFrames.middle, fps)}
              </span>
            </div>
          </div>

          {/* Last Frame */}
          <div
            onClick={() => setEditingKeyframeSlot('last')}
            className="group relative bg-slate-950 rounded-xl border border-slate-800 overflow-hidden cursor-pointer hover:border-cyan-500/60 transition-all shadow-md"
          >
            <img
              src={shot.lastFrameUrl}
              alt="尾帧"
              className="w-full aspect-video object-cover group-hover:scale-105 transition-transform"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-90 p-2 flex flex-col justify-end">
              <span className="text-[10px] font-bold text-rose-400">尾帧</span>
              <span className="text-[10px] font-mono text-slate-300">{frameToTimecode(representativeFrames.last, fps)}</span>
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
      </div>

      {/* Boundary Editor (以帧为单位) */}
      <div className="bg-slate-950 rounded-xl p-4 border border-slate-800/80 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            以帧为单位的边界裁剪 (Frame-precise Boundaries)
          </span>
          {shot.modifiedSource === 'USER' && (
            <button
              onClick={handleResetBoundaries}
              className="text-[11px] text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition-colors"
              title="重置回检测到的原始 AI 边界"
            >
              <RotateCcw className="w-3 h-3" />
              <span>恢复原始边界</span>
            </button>
          )}
        </div>

        {/* Boundary Adjusters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Start Frame Controls */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-slate-400 flex items-center justify-between">
              <span>起始帧 (Start Frame)</span>
              <span className="font-mono text-cyan-400">{shot.startTimecode}</span>
            </label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleStartFrameChange(shot.startFrame - 1)}
                className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-mono font-bold text-slate-200 border border-slate-700 transition-colors"
              >
                -1
              </button>
              <input
                type="number"
                value={shot.startFrame}
                onChange={(e) => handleStartFrameChange(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-100 text-center focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={() => handleStartFrameChange(shot.startFrame + 1)}
                className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-mono font-bold text-slate-200 border border-slate-700 transition-colors"
              >
                +1
              </button>
            </div>
          </div>

          {/* End Frame Controls */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-slate-400 flex items-center justify-between">
              <span>结束帧 (End Frame)</span>
              <span className="font-mono text-cyan-400">{shot.endTimecode}</span>
            </label>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleEndFrameChange(shot.endFrame - 1)}
                className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-mono font-bold text-slate-200 border border-slate-700 transition-colors"
              >
                -1
              </button>
              <input
                type="number"
                value={shot.endFrame}
                onChange={(e) => handleEndFrameChange(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-100 text-center focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={() => handleEndFrameChange(shot.endFrame + 1)}
                className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-mono font-bold text-slate-200 border border-slate-700 transition-colors"
              >
                +1
              </button>
            </div>
          </div>

        </div>

        {/* Raw vs Current Boundary Audit Info */}
        <div className="text-[11px] font-mono text-slate-400 bg-slate-900/60 rounded-lg p-2.5 border border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-slate-500">原始边界: </span>
            <span className="text-slate-300">{rawStartTimecode} ~ {rawEndTimecode}</span>
          </div>
          <div>
            <span className="text-slate-500">当前边界: </span>
            <span className="text-cyan-400 font-bold">{shot.startTimecode} ~ {shot.endTimecode}</span>
          </div>
          <div>
            <span className="text-slate-500">时长: </span>
            <span className="text-slate-200">{shot.duration.toFixed(3)}s ({shot.durationFrames} 帧)</span>
          </div>
        </div>
      </div>

      {/* Status Review Marker (保留 / 待确认 / 废弃) */}
      <div>
        <label className="text-xs font-semibold text-slate-400 block mb-2">
          镜头审核标记 (Status Marking)
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleStatusChange('keep')}
            className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              shot.status === 'keep'
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-emerald-400'
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>保留 (Keep)</span>
          </button>

          <button
            onClick={() => handleStatusChange('pending')}
            className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              shot.status === 'pending'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-amber-400'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>待确认</span>
          </button>

          <button
            onClick={() => handleStatusChange('discard')}
            className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
              shot.status === 'discard'
                ? 'bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-500/20'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-rose-400'
            }`}
          >
            <X className="w-3.5 h-3.5" />
            <span>废弃</span>
          </button>
        </div>
      </div>

      {/* Tags Manager */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-cyan-400" />
            镜头分类标签 (Tags)
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-2">
          {shot.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 bg-slate-800 text-slate-200 border border-slate-700 px-2.5 py-1 rounded-lg text-xs"
            >
              <span>{tag}</span>
              <button
                onClick={() => handleRemoveTag(tag)}
                className="hover:text-rose-400 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {!showTagAdd && (
            <button
              onClick={() => setShowTagAdd(true)}
              className="inline-flex items-center gap-1 text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2 py-1 rounded-lg hover:bg-cyan-500/20 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>添加标签</span>
            </button>
          )}
        </div>

        {/* Preset Quick Tags */}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {PRESET_TAGS.filter((t) => !shot.tags.includes(t)).map((preset) => (
            <button
              key={preset}
              onClick={() => handleAddTag(preset)}
              className="text-[10px] text-slate-400 hover:text-slate-100 bg-slate-950 hover:bg-slate-800 px-2 py-0.5 rounded border border-slate-800/80 transition-colors"
            >
              + {preset}
            </button>
          ))}
        </div>

        {showTagAdd && (
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              placeholder="输入新标签..."
              value={newTagInput}
              onChange={(e) => setNewTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTag(newTagInput)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 flex-1"
            />
            <button
              onClick={() => handleAddTag(newTagInput)}
              className="px-3 py-1.5 bg-cyan-500 text-slate-950 text-xs font-bold rounded-lg"
            >
              确认
            </button>
          </div>
        )}
      </div>

      {/* Notes & Remarks Textarea */}
      <div>
        <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5 mb-2">
          <FileText className="w-3.5 h-3.5 text-cyan-400" />
          审核备注 / 镜头说明
        </label>
        <textarea
          rows={2}
          value={shot.notes || ''}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="添加对此镜头的审核备注，例如：背景噪点过大、主体出画、可用于片头..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
        />
      </div>

    </div>
  );
};
