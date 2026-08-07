import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, X } from 'lucide-react';
import { Shot, VideoMetadata } from '../types';
import { frameToTimecode } from '../utils/timecode';

interface ShotPreviewOverlayProps {
  shot: Shot;
  metadata: VideoMetadata;
  onClose: () => void;
}

export const ShotPreviewOverlay: React.FC<ShotPreviewOverlayProps> = ({
  shot,
  metadata,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const startTime = shot.startFrame / metadata.fps;
  const endTime = (shot.endFrame + 1) / metadata.fps;

  const seekToStart = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = startTime;
    setHasStarted(true);
    video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoaded = () => {
      video.currentTime = startTime;
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    };
    video.addEventListener('loadedmetadata', handleLoaded);
    return () => video.removeEventListener('loadedmetadata', handleLoaded);
  }, [startTime]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || video.currentTime < endTime) return;
    video.currentTime = startTime;
    video.play().catch(() => setIsPlaying(false));
    setHasStarted(true);
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (!hasStarted || video.currentTime < startTime || video.currentTime >= endTime) {
        video.currentTime = startTime;
      }
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      video.pause();
      setIsPlaying(false);
    }
    setHasStarted(true);
  };

  return (
    <aside className="fixed bottom-5 right-5 z-50 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-cyan-400/40 bg-slate-950 shadow-2xl shadow-black/50 ring-1 ring-white/10">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-3 py-2">
        <div>
          <div className="text-xs font-semibold text-slate-100">
            镜头 {String(shot.shotNumber).padStart(2, '0')} · 循环预览
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-slate-400">
            {frameToTimecode(shot.startFrame, metadata.fps)} - {frameToTimecode(shot.endFrame, metadata.fps)}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          title="关闭预览"
          aria-label="关闭预览"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <video
        ref={videoRef}
        src={metadata.url}
        className="aspect-video w-full bg-black object-contain"
        muted
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <div className="flex items-center justify-between bg-slate-900 px-3 py-2">
        <span className="text-[11px] text-cyan-300">首帧至尾帧 · 自动循环</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={seekToStart}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            title="从首帧重新播放"
            aria-label="从首帧重新播放"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={togglePlayback}
            className="rounded-lg bg-cyan-500 p-1.5 text-slate-950 hover:bg-cyan-400"
            title={isPlaying ? '暂停预览' : '播放预览'}
            aria-label={isPlaying ? '暂停预览' : '播放预览'}
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
          </button>
        </div>
      </div>
    </aside>
  );
};
