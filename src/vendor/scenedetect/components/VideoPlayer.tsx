import React, { useRef, useEffect, useState } from 'react';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  ChevronLeft, 
  ChevronRight, 
  Repeat, 
  Scissors, 
  Volume2, 
  VolumeX, 
  Maximize,
  Gauge
} from 'lucide-react';
import { VideoMetadata, Shot } from '../types';
import { frameToTimecode } from '../utils/timecode';

interface VideoPlayerProps {
  metadata: VideoMetadata | null;
  shots: Shot[];
  currentFrame: number;
  activeShot: Shot | null;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeekFrame: (frame: number) => void;
  onSplitShotAtFrame: (frame: number) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  metadata,
  shots,
  currentFrame,
  activeShot,
  isPlaying,
  onPlayPause,
  onSeekFrame,
  onSplitShotAtFrame,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [loopActiveShot, setLoopActiveShot] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const fps = metadata?.fps || 30;
  const totalFrames = metadata?.totalFrames || 0;
  const duration = metadata?.duration || 0;

  // Sync HTML5 Video currentTime with currentFrame state
  useEffect(() => {
    if (videoRef.current && metadata) {
      const targetTime = currentFrame / fps;
      if (Math.abs(videoRef.current.currentTime - targetTime) > 0.1) {
        videoRef.current.currentTime = targetTime;
      }
    }
  }, [currentFrame, fps, metadata]);

  // Handle Video element time updates while playing
  const handleTimeUpdate = () => {
    if (videoRef.current && isPlaying) {
      const frame = Math.round(videoRef.current.currentTime * fps);
      
      // Loop after the complete inclusive end frame has been displayed.
      if (
        loopActiveShot &&
        activeShot &&
        videoRef.current.currentTime >= (activeShot.endFrame + 1) / fps
      ) {
        videoRef.current.currentTime = activeShot.startFrame / fps;
        onSeekFrame(activeShot.startFrame);
        return;
      }

      onSeekFrame(frame);
    }
  };

  // Sync play/pause state with video element
  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
  }, [isPlaying]);

  // Change playback speed
  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const currentFormattedTimecode = frameToTimecode(currentFrame, fps, true);
  const totalFormattedTimecode = frameToTimecode(totalFrames, fps, true);
  const playbackShot = shots.find((shot) => currentFrame >= shot.startFrame && currentFrame <= shot.endFrame) || null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
      {/* Video Viewport Stage */}
      <div className="relative aspect-video bg-black flex items-center justify-center group">
        {metadata?.url ? (
          <video
            ref={videoRef}
            src={metadata.url}
            className="w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onEnded={onPlayPause}
            muted={isMuted}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500">
            <p className="text-sm">未载入视频，请从顶部导航上传或选择示例视频</p>
          </div>
        )}

        {/* Current Time Overlay Tag */}
        <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs font-mono font-bold text-cyan-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
          <span>{currentFormattedTimecode}</span>
          <span className="text-slate-400">/ {totalFormattedTimecode}</span>
          <span className="text-slate-500 border-l border-slate-700 pl-2">
            [ Frame {currentFrame} / {totalFrames} ]
          </span>
        </div>

        {/* Playback Shot Recognition Result */}
        <div className={`absolute top-3 right-3 max-w-[min(52%,22rem)] backdrop-blur-md px-3 py-1.5 rounded-lg border text-xs flex items-center gap-2 ${
          playbackShot
            ? 'bg-slate-900/85 border-cyan-400/40 text-slate-200'
            : 'bg-slate-900/75 border-slate-700 text-slate-400'
        }`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${playbackShot ? 'bg-cyan-400' : 'bg-slate-500'}`} />
          {playbackShot ? (
            <>
              <span className="shrink-0 font-semibold text-cyan-300">镜头 {String(playbackShot.shotNumber).padStart(2, '0')}</span>
              <span className="truncate font-mono text-slate-300">{playbackShot.startTimecode} ~ {playbackShot.endTimecode}</span>
            </>
          ) : (
            <span>当前帧未处于已识别镜头</span>
          )}
        </div>
      </div>

      {/* Seek Progress Scrubber Bar */}
      <div className="px-4 pt-2.5 bg-slate-950">
        <input
          type="range"
          min={0}
          max={Math.max(1, totalFrames)}
          value={currentFrame}
          onChange={(e) => onSeekFrame(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-400 transition-all"
        />
      </div>

      {/* Player Toolbar Controls */}
      <div className="p-3 bg-slate-950 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/60">
        
        {/* Playback Controls */}
        <div className="flex items-center gap-1.5">
          {/* Jump to Active Shot Start */}
          <button
            onClick={() => activeShot && onSeekFrame(activeShot.startFrame)}
            disabled={!activeShot}
            title="跳转到当前镜头首帧"
            className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          {/* Frame Step -1 */}
          <button
            onClick={() => onSeekFrame(Math.max(0, currentFrame - 1))}
            title="后退一帧 (-1 Frame)"
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1 text-xs font-mono"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>-1f</span>
          </button>

          {/* Main Play / Pause Button */}
          <button
            onClick={onPlayPause}
            className="p-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-lg shadow-cyan-500/20 transition-all active:scale-95 mx-1"
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          {/* Frame Step +1 */}
          <button
            onClick={() => onSeekFrame(Math.min(totalFrames, currentFrame + 1))}
            title="前进一帧 (+1 Frame)"
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1 text-xs font-mono"
          >
            <span>+1f</span>
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Jump to Active Shot End */}
          <button
            onClick={() => activeShot && onSeekFrame(activeShot.endFrame)}
            disabled={!activeShot}
            title="跳转到当前镜头尾帧"
            className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Operations: Split Shot at Playhead */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSplitShotAtFrame(currentFrame)}
            title="在当前指针帧拆分镜头"
            className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>在当前帧拆分镜头</span>
          </button>

          {/* Shot Loop Toggle */}
          <button
            onClick={() => setLoopActiveShot(!loopActiveShot)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition-colors ${
              loopActiveShot
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="循环播放选中的镜头范围"
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>循环镜头</span>
          </button>
        </div>

        {/* Secondary controls: Speed & Audio */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          
          {/* Speed Selector */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
            <Gauge className="w-3.5 h-3.5 text-slate-500 ml-1" />
            {[0.5, 1, 1.5, 2].map((rate) => (
              <button
                key={rate}
                onClick={() => handleSpeedChange(rate)}
                className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${
                  playbackRate === rate ? 'bg-cyan-500/20 text-cyan-400 font-bold' : 'hover:text-slate-200'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          {/* Mute Button */}
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

        </div>

      </div>
    </div>
  );
};
