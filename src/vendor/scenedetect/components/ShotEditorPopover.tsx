import React, { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Minus, Plus, Scissors, X } from 'lucide-react';
import { Shot } from '../types';
import { frameToTimecode } from '../utils/timecode';
import { captureVideoFrame } from '../utils/sceneDetector';

type EditorMode = 'boundary' | 'split';

interface ShotEditorPopoverProps {
  shot: Shot;
  fps: number;
  totalFrames: number;
  videoUrl: string;
  mode: EditorMode;
  onUpdateShot: (shot: Shot) => void;
  onSplit: (shotId: string, splitFrame: number) => void;
  onClose: () => void;
}

export const ShotEditorPopover: React.FC<ShotEditorPopoverProps> = ({ shot, fps, totalFrames, videoUrl, mode, onUpdateShot, onSplit, onClose }) => {
  const [startFrame, setStartFrame] = useState(shot.startFrame);
  const [endFrame, setEndFrame] = useState(shot.endFrame);
  const [splitFrame, setSplitFrame] = useState(Math.floor((shot.startFrame + shot.endFrame) / 2));
  const [framePreviews, setFramePreviews] = useState<Array<{ label: string; frame: number; url: string; isBoundaryFrame: boolean }>>([]);
  const [splitPreviews, setSplitPreviews] = useState<Array<{ frame: number; url: string; side: 'before' | 'after' }>>([]);
  const holdTimeoutRef = React.useRef<number | null>(null);
  const holdIntervalRef = React.useRef<number | null>(null);

  useEffect(() => {
    setStartFrame(shot.startFrame);
    setEndFrame(shot.endFrame);
    setSplitFrame(Math.floor((shot.startFrame + shot.endFrame) / 2));
  }, [shot.id, shot.startFrame, shot.endFrame]);

  useEffect(() => {
    if (mode !== 'boundary') return;
    let cancelled = false;
    const targets = [
      { label: '起点前一帧', frame: Math.max(0, startFrame - 1), fallback: shot.firstFrameUrl, isBoundaryFrame: false },
      { label: '当前起始帧', frame: startFrame, fallback: shot.firstFrameUrl, isBoundaryFrame: true },
      { label: '当前结束帧', frame: endFrame, fallback: shot.lastFrameUrl, isBoundaryFrame: true },
      { label: '终点后一帧', frame: Math.min(totalFrames - 1, endFrame + 1), fallback: shot.lastFrameUrl, isBoundaryFrame: false },
    ];
    setFramePreviews(targets.map(({ label, frame, fallback, isBoundaryFrame }) => ({ label, frame, url: fallback, isBoundaryFrame })));
    Promise.all(targets.map(async (target) => ({ ...target, url: await captureVideoFrame(videoUrl, target.frame / fps).catch(() => target.fallback) })))
      .then((previews) => { if (!cancelled) setFramePreviews(previews.map(({ label, frame, url, isBoundaryFrame }) => ({ label, frame, url, isBoundaryFrame }))); });
    return () => { cancelled = true; };
  }, [mode, videoUrl, fps, startFrame, endFrame, totalFrames, shot.firstFrameUrl, shot.lastFrameUrl]);

  useEffect(() => {
    if (mode !== 'split') return;
    let cancelled = false;
    const clampFrame = (frame: number) => Math.max(shot.startFrame, Math.min(shot.endFrame, frame));
    const targets = [
      { frame: clampFrame(splitFrame - 3), side: 'before' as const, fallback: shot.firstFrameUrl },
      { frame: clampFrame(splitFrame - 2), side: 'before' as const, fallback: shot.firstFrameUrl },
      { frame: clampFrame(splitFrame - 1), side: 'before' as const, fallback: shot.firstFrameUrl },
      { frame: clampFrame(splitFrame), side: 'after' as const, fallback: shot.lastFrameUrl },
      { frame: clampFrame(splitFrame + 1), side: 'after' as const, fallback: shot.lastFrameUrl },
      { frame: clampFrame(splitFrame + 2), side: 'after' as const, fallback: shot.lastFrameUrl },
    ];
    setSplitPreviews(targets.map(({ frame, side, fallback }) => ({ frame, side, url: fallback })));
    Promise.all(targets.map(async (target) => ({
      ...target,
      url: await captureVideoFrame(videoUrl, target.frame / fps).catch(() => target.fallback),
    }))).then((previews) => {
      if (!cancelled) setSplitPreviews(previews.map(({ frame, side, url }) => ({ frame, side, url })));
    });
    return () => { cancelled = true; };
  }, [mode, videoUrl, fps, splitFrame, shot.startFrame, shot.endFrame, shot.firstFrameUrl, shot.lastFrameUrl]);

  useEffect(() => () => {
    if (holdTimeoutRef.current !== null) window.clearTimeout(holdTimeoutRef.current);
    if (holdIntervalRef.current !== null) window.clearInterval(holdIntervalRef.current);
  }, []);

  const updateStart = (value: number) => setStartFrame(Math.max(0, Math.min(value, endFrame - 1)));
  const updateEnd = (value: number) => setEndFrame(Math.min(totalFrames - 1, Math.max(value, startFrame + 1)));
  const updateSplit = (delta: number) => setSplitFrame((value) => Math.max(shot.startFrame + 1, Math.min(value + delta, shot.endFrame - 1)));
  const stopAdjustingSplit = () => {
    if (holdTimeoutRef.current !== null) window.clearTimeout(holdTimeoutRef.current);
    if (holdIntervalRef.current !== null) window.clearInterval(holdIntervalRef.current);
    holdTimeoutRef.current = null;
    holdIntervalRef.current = null;
  };
  const startAdjustingSplit = (delta: number) => {
    stopAdjustingSplit();
    updateSplit(delta);
    holdTimeoutRef.current = window.setTimeout(() => {
      holdIntervalRef.current = window.setInterval(() => updateSplit(delta), 70);
    }, 350);
  };

  const saveBoundary = () => {
    const durationFrames = endFrame - startFrame + 1;
    onUpdateShot({ ...shot, startFrame, endFrame, startTimecode: frameToTimecode(startFrame, fps), endTimecode: frameToTimecode(endFrame, fps), durationFrames, duration: durationFrames / fps, modifiedSource: 'USER' });
    onClose();
  };

  const confirmSplit = () => {
    if (splitFrame > shot.startFrame && splitFrame < shot.endFrame) {
      onSplit(shot.id, splitFrame);
      onClose();
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-cyan-500/30 bg-slate-950/95 p-3 shadow-xl" onClick={(event) => event.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
          {mode === 'boundary' ? '编辑镜头边界' : '拆分当前镜头'}
          <span className="font-normal text-slate-500">镜头 {String(shot.shotNumber).padStart(2, '0')}</span>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-white" title="取消编辑"><X className="h-3.5 w-3.5" /></button>
      </div>

      {mode === 'boundary' ? (
        <>
          <div className="mb-2 text-[11px] font-semibold text-slate-400">边界前后参考帧（用于确认切点是否准确）</div>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {framePreviews.map((preview) => (
              <div key={`${preview.label}-${preview.frame}`} className={`overflow-hidden rounded-lg bg-slate-900 ${preview.isBoundaryFrame ? 'border border-orange-400/80 ring-1 ring-orange-400/20' : 'border border-transparent'}`}>
                <img src={preview.url} alt={`${preview.label} Frame ${preview.frame}`} className="aspect-video w-full object-cover" />
                <div className={`px-2 py-1.5 text-[10px] ${preview.isBoundaryFrame ? 'text-orange-300' : 'text-slate-400'}`}><div>{preview.label}</div><span className={`font-mono ${preview.isBoundaryFrame ? 'text-orange-300' : 'text-cyan-300'}`}>F{preview.frame} · {frameToTimecode(preview.frame, fps)}</span></div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <FrameField label="起始帧" value={startFrame} timecode={frameToTimecode(startFrame, fps)} min={0} max={endFrame - 1} onChange={updateStart} />
            <FrameField label="结束帧" value={endFrame} timecode={frameToTimecode(endFrame, fps)} min={startFrame + 1} max={totalFrames - 1} onChange={updateEnd} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">范围 {endFrame - startFrame + 1} 帧</span>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800">取消</button>
              <button type="button" onClick={saveBoundary} className="flex items-center gap-1 rounded-lg bg-cyan-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400"><Check className="h-3.5 w-3.5" />保存边界</button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-slate-200">拆分位置：<strong className="font-mono text-amber-300">Frame {splitFrame}</strong><span className="ml-2 font-mono text-amber-200/70">{frameToTimecode(splitFrame, fps)}</span></div>

          <div className="mt-3 flex items-stretch gap-2 rounded-xl border border-amber-500/30 bg-slate-900/80 p-2">
            <div className="flex flex-1 items-center justify-end gap-1 border-r border-dashed border-amber-500/40 pr-2">
              {splitPreviews.slice(0, 3).map((preview, index) => (
                <div key={`before-${preview.frame}-${index}`} className="min-w-0 flex-1 overflow-hidden rounded-md border border-slate-700 bg-slate-950">
                  <img src={preview.url} alt={`切分点前第${3 - index}帧`} className="aspect-video w-full object-cover" />
                  <div className="truncate px-1 py-1 text-center font-mono text-[9px] text-slate-400">F{preview.frame}</div>
                </div>
              ))}
            </div>
            <div className="flex w-10 shrink-0 flex-col items-center justify-center gap-1 text-amber-300" aria-label="切分点">
              <span className="h-5 border-l-2 border-amber-400" />
              <span className="text-[10px] font-bold [writing-mode:vertical-rl]">切分点</span>
              <span className="h-5 border-l-2 border-amber-400" />
            </div>
            <div className="flex flex-1 items-center gap-1 border-l border-dashed border-amber-500/40 pl-2">
              {splitPreviews.slice(3).map((preview, index) => (
                <div key={`after-${preview.frame}-${index}`} className="min-w-0 flex-1 overflow-hidden rounded-md border border-slate-700 bg-slate-950">
                  <img src={preview.url} alt={`切分点后第${index + 1}帧`} className="aspect-video w-full object-cover" />
                  <div className="truncate px-1 py-1 text-center font-mono text-[9px] text-slate-400">F{preview.frame}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); startAdjustingSplit(-1); }}
              onPointerUp={stopAdjustingSplit}
              onPointerCancel={stopAdjustingSplit}
              onPointerLeave={stopAdjustingSplit}
              onContextMenu={(event) => event.preventDefault()}
              className="flex min-h-10 items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/20 active:bg-amber-500/30"
              title="减少 1 帧，按住可连续调整"
              aria-label="减少 1 帧，按住可连续调整"
            >
              <Minus className="h-4 w-4" /> -1 帧
            </button>
            <span className="min-w-24 text-center font-mono text-sm text-amber-300">F{splitFrame}</span>
            <button
              type="button"
              onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); startAdjustingSplit(1); }}
              onPointerUp={stopAdjustingSplit}
              onPointerCancel={stopAdjustingSplit}
              onPointerLeave={stopAdjustingSplit}
              onContextMenu={(event) => event.preventDefault()}
              className="flex min-h-10 items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/20 active:bg-amber-500/30"
              title="增加 1 帧，按住可连续调整"
              aria-label="增加 1 帧，按住可连续调整"
            >
              <Plus className="h-4 w-4" /> +1 帧
            </button>
          </div>

          <input type="range" min={shot.startFrame + 1} max={shot.endFrame - 1} value={splitFrame} onChange={(event) => setSplitFrame(Number(event.target.value))} className="mt-3 w-full accent-amber-400" aria-label="拖动调整拆分帧" />
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="rounded-lg bg-slate-900 p-2 text-slate-400">前半段<br /><span className="text-cyan-300">{frameToTimecode(shot.startFrame, fps)} - {frameToTimecode(splitFrame - 1, fps)}</span></div>
            <div className="rounded-lg bg-slate-900 p-2 text-slate-400">后半段<br /><span className="text-cyan-300">{frameToTimecode(splitFrame, fps)} - {frameToTimecode(shot.endFrame, fps)}</span></div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800">取消</button>
            <button type="button" onClick={confirmSplit} className="flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400"><Scissors className="h-3.5 w-3.5" />确认拆分</button>
          </div>
        </>
      )}
    </div>
  );
};

interface FrameFieldProps { label: string; value: number; timecode: string; min: number; max: number; onChange: (value: number) => void; }

const FrameField: React.FC<FrameFieldProps> = ({ label, value, timecode, min, max, onChange }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400"><span>{label}</span><span className="font-mono text-cyan-300">{timecode}</span></div>
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} className="rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30" title="前一帧"><ChevronLeft className="h-3.5 w-3.5" /></button>
      <input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-center font-mono text-xs text-white focus:border-cyan-500 focus:outline-none" />
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} className="rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30" title="后一帧"><ChevronRight className="h-3.5 w-3.5" /></button>
    </div>
  </div>
);
