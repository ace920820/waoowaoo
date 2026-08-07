import React from 'react';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Shot } from '../types';
import { captureVideoFrame, getDefaultKeyframeFrames } from '../utils/sceneDetector';
import { frameToTimecode } from '../utils/timecode';

export type FrameSlot = 'first' | 'middle' | 'last';

interface KeyframeSelectorPopoverProps {
  shot: Shot;
  fps: number;
  videoUrl: string;
  initialSlot: FrameSlot;
  onSeekFrame: (frame: number) => void;
  onUpdateShot: (shot: Shot) => void;
  onClose: () => void;
}

const SLOT_LABELS: Record<FrameSlot, string> = {
  first: '首帧代表图',
  middle: '中间代表图',
  last: '尾帧代表图',
};

const SLOT_ORDER: FrameSlot[] = ['first', 'middle', 'last'];

export const KeyframeSelectorPopover: React.FC<KeyframeSelectorPopoverProps> = ({
  shot,
  fps,
  videoUrl,
  initialSlot,
  onSeekFrame,
  onUpdateShot,
  onClose,
}) => {
  const initialFrames = shot.keyframeFrames || getDefaultKeyframeFrames(shot);
  const [activeSlot, setActiveSlot] = React.useState<FrameSlot>(initialSlot);
  const [frames, setFrames] = React.useState(initialFrames);
  const [urls, setUrls] = React.useState({
    first: shot.firstFrameUrl,
    middle: shot.middleFrameUrl,
    last: shot.lastFrameUrl,
  });
  const [candidateUrls, setCandidateUrls] = React.useState<Array<{ frame: number; url: string }>>([]);
  const [loading, setLoading] = React.useState(false);

  const selectedFrame = frames[activeSlot];
  const fallbackUrl = urls[activeSlot];
  const clampFrame = (frame: number) => Math.max(shot.startFrame, Math.min(shot.endFrame, Math.floor(frame)));

  React.useEffect(() => {
    const nextFrames = shot.keyframeFrames || getDefaultKeyframeFrames(shot);
    setFrames(nextFrames);
    setUrls({ first: shot.firstFrameUrl, middle: shot.middleFrameUrl, last: shot.lastFrameUrl });
  }, [shot.id, shot.firstFrameUrl, shot.middleFrameUrl, shot.lastFrameUrl, shot.keyframeFrames, shot.startFrame, shot.endFrame]);

  React.useEffect(() => {
    let cancelled = false;
    const candidateFrames = Array.from(new Set(
      [-3, -2, -1, 0, 1, 2, 3].map((offset) => clampFrame(selectedFrame + offset)),
    ));
    setCandidateUrls(candidateFrames.map((frame) => ({ frame, url: fallbackUrl })));
    setLoading(true);
    Promise.all(candidateFrames.map(async (frame) => ({
      frame,
      url: await captureVideoFrame(videoUrl, frame / fps).catch(() => fallbackUrl),
    }))).then((previews) => {
      if (!cancelled) setCandidateUrls(previews);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeSlot, selectedFrame, videoUrl, fps, shot.startFrame, shot.endFrame, fallbackUrl]);

  const selectFrame = (frame: number, url: string) => {
    const safeFrame = clampFrame(frame);
    setFrames((previous) => ({ ...previous, [activeSlot]: safeFrame }));
    setUrls((previous) => ({ ...previous, [activeSlot]: url }));
    onSeekFrame(safeFrame);
  };

  const save = () => {
    onUpdateShot({
      ...shot,
      firstFrameUrl: urls.first,
      middleFrameUrl: urls.middle,
      lastFrameUrl: urls.last,
      keyframeFrames: frames,
      keyframeSource: 'USER',
      modifiedSource: 'USER',
    });
    onClose();
  };

  return (
    <div className="mt-3 rounded-xl border border-indigo-500/40 bg-slate-950/95 p-3 shadow-xl" onClick={(event) => event.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
        <div>
          <div className="text-xs font-semibold text-slate-100">选择{SLOT_LABELS[activeSlot]}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">仅显示当前镜头内、当前帧前后各 3 帧</div>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-white" title="关闭代表帧选择器">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-lg bg-slate-900 p-1">
        {SLOT_ORDER.map((slot) => (
          <button
            key={slot}
            type="button"
            onClick={() => setActiveSlot(slot)}
            className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${activeSlot === slot ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            {SLOT_LABELS[slot]}
          </button>
        ))}
      </div>

      <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
        <span>当前选择</span>
        <span className="font-mono text-indigo-300">F{selectedFrame} · {frameToTimecode(selectedFrame, fps)}</span>
      </div>

      <div className="flex items-stretch gap-1.5 overflow-x-auto rounded-xl border border-indigo-500/30 bg-slate-900/80 p-2">
        {candidateUrls.map((candidate) => {
          const isSelected = candidate.frame === selectedFrame;
          return (
            <button
              key={candidate.frame}
              type="button"
              onClick={() => selectFrame(candidate.frame, candidate.url)}
              className={`min-w-[92px] flex-1 overflow-hidden rounded-lg bg-slate-950 text-left transition-all ${isSelected ? 'border-2 border-indigo-400 ring-2 ring-indigo-400/30' : 'border border-slate-700 hover:border-indigo-400/60'}`}
              title={`选择第 ${candidate.frame} 帧`}
            >
              <img src={candidate.url} alt={`${SLOT_LABELS[activeSlot]}候选帧 ${candidate.frame}`} className="aspect-video w-full object-cover" />
              <span className={`block px-1.5 py-1 text-center font-mono text-[10px] ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                F{candidate.frame} · {frameToTimecode(candidate.frame, fps)}
              </span>
            </button>
          );
        })}
      </div>

      {loading && <div className="mt-1 text-[10px] text-slate-500">正在加载当前镜头的候选帧...</div>}

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => selectFrame(selectedFrame - 1, fallbackUrl)} disabled={selectedFrame <= shot.startFrame || loading} className="rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30" title="前一帧">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => selectFrame(selectedFrame + 1, fallbackUrl)} disabled={selectedFrame >= shot.endFrame || loading} className="rounded-md border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30" title="后一帧">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-800">取消</button>
          <button type="button" onClick={save} disabled={loading} className="flex items-center gap-1 rounded-lg bg-indigo-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-40"><Check className="h-3.5 w-3.5" />保存当前代表图</button>
        </div>
      </div>
    </div>
  );
};
