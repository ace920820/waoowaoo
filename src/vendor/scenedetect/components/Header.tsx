import React from 'react';
import { 
  Upload, 
  Play, 
  RefreshCw, 
  Download, 
  FileJson, 
  Undo2, 
  Redo2, 
  Film, 
  CheckCircle2, 
  Clock, 
  Sparkles,
  SlidersHorizontal,
  ChevronDown,
  FolderOpen,
} from 'lucide-react';
import { AnalysisStatus, VideoMetadata, Shot } from '../types';
import { SAMPLE_VIDEOS, SampleVideoPreset } from '../utils/sampleVideos';
import { formatDuration, formatFileSize } from '../utils/timecode';

interface HeaderProps {
  embedded?: boolean;
  /** embedded 模式下是否开放「导出结果」（runtime.canExport） */
  canExport?: boolean;
  status: AnalysisStatus;
  metadata: VideoMetadata | null;
  shots: Shot[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onUploadClick: () => void;
  onSelectSample: (preset: SampleVideoPreset) => void;
  onStartAnalysis: () => void;
  projectName: string;
  isProjectDirty: boolean;
  onProjectClick: () => void;
  onExportClick: () => void;
  /** embedded：导入切分点/关键帧选择文件 */
  onImportClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  embedded = false,
  canExport = false,
  status,
  metadata,
  shots,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onUploadClick,
  onSelectSample,
  onStartAnalysis,
  projectName,
  isProjectDirty,
  onProjectClick,
  onExportClick,
  onImportClick,
}) => {
  const [showSampleDropdown, setShowSampleDropdown] = React.useState(false);

  const getStatusBadge = () => {
    switch (status) {
      case 'idle':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
            <Film className="w-3.5 h-3.5 text-slate-400" />
            未加载视频
          </span>
        );
      case 'uploaded_pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
            <Clock className="w-3.5 h-3.5" />
            已上传，等待确认分析
          </span>
        );
      case 'analyzing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            正在镜头识别...
          </span>
        );
      case 'analyzed_review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            识别完成，待审核
          </span>
        );
      case 'adjusted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            已人工调整
          </span>
        );
      case 'exported':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            已导出
          </span>
        );
    }
  };

  const keptCount = shots.filter((s) => s.status === 'keep').length;
  const pendingCount = shots.filter((s) => s.status === 'pending').length;
  const discardCount = shots.filter((s) => s.status === 'discard').length;

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        {/* Main Header Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          
          {/* Left Title & Status */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  镜头识别与关键帧分析工作台
                </h1>
                {getStatusBadge()}
              </div>
              <p className="text-xs text-slate-400 hidden sm:block mt-0.5">
                {metadata ? `${metadata.name} (${formatFileSize(metadata.size)})` : '支持 MP4/WebM 格式，镜头自动切分与三帧关键帧审核'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto justify-end">
            
            {/* Undo / Redo */}
            <div className="flex items-center rounded-lg bg-slate-800/80 p-0.5 border border-slate-700/60">
              <button
                onClick={onUndo}
                disabled={!canUndo}
                title="撤销 (Undo)"
                className="p-1.5 text-slate-300 hover:text-white disabled:opacity-40 disabled:hover:text-slate-300 hover:bg-slate-700/60 rounded-md transition-colors"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={onRedo}
                disabled={!canRedo}
                title="重做 (Redo)"
                className="p-1.5 text-slate-300 hover:text-white disabled:opacity-40 disabled:hover:text-slate-300 hover:bg-slate-700/60 rounded-md transition-colors"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            {/* Sample Videos Selector */}
            {!embedded && <div className="relative">
              <button
                onClick={() => setShowSampleDropdown(!showSampleDropdown)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>示例视频</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showSampleDropdown && (
                <div className="absolute right-0 mt-2 w-72 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-2 z-50 text-left">
                  <div className="px-3 py-1.5 border-b border-slate-700 text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
                    选择内置测试示例
                  </div>
                  {SAMPLE_VIDEOS.map((sample) => (
                    <button
                      key={sample.id}
                      onClick={() => {
                        onSelectSample(sample);
                        setShowSampleDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-700/80 transition-colors flex flex-col gap-0.5"
                    >
                      <span className="text-xs font-semibold text-slate-100">{sample.name}</span>
                      <span className="text-[11px] text-slate-400 line-clamp-1">{sample.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>}

            {/* Upload Video Button */}
            <button
              type="button"
              onClick={onUploadClick}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span>上传视频</span>
            </button>

            {/* Start / Re-Analyze Button */}
            {status === 'uploaded_pending' ? (
              <button
                onClick={onStartAnalysis}
                className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-cyan-500/25 transition-all transform active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>确认分析</span>
              </button>
            ) : status !== 'idle' ? (
              <button
                onClick={onStartAnalysis}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>重新分析</span>
              </button>
            ) : null}

            {/* Export Button */}
            {!embedded && <button
              onClick={onProjectClick}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="打开项目管理"
            >
              <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>项目</span>
              <span className="max-w-28 truncate text-slate-400">{projectName}</span>
              {isProjectDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
            </button>}

            {(!embedded || canExport) && <button
              type="button"
              data-testid="scenedetect-export-button"
              onClick={onExportClick}
              disabled={shots.length === 0}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>导出结果</span>
            </button>}

            {/* Import Shot Boundaries / Keyframe Selection (embedded) */}
            {embedded && onImportClick && (
              <button
                type="button"
                data-testid="scenedetect-import-button"
                onClick={onImportClick}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition-colors"
                title="导入之前导出的切分点与关键帧选择 (.scenedetect.json)"
              >
                <FileJson className="w-3.5 h-3.5 text-cyan-400" />
                <span>导入切分点</span>
              </button>
            )}

          </div>
        </div>

        {/* Video & Shot Metrics Subbar */}
        {metadata && (
          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-y-1">
            <div className="flex items-center gap-4 flex-wrap">
              <span>时长: <strong className="text-slate-200">{formatDuration(metadata.duration)}</strong></span>
              <span>帧率: <strong className="text-slate-200">{metadata.fps} FPS</strong></span>
              <span>分辨率: <strong className="text-slate-200">{metadata.width}x{metadata.height}</strong></span>
              <span>总帧数: <strong className="text-slate-200">{metadata.totalFrames} 帧</strong></span>
            </div>

            {shots.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-slate-300">
                  镜头总数: <strong className="text-cyan-400">{shots.length}</strong>
                </span>
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> 保留: {keptCount}
                </span>
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span> 待定: {pendingCount}
                </span>
                <span className="inline-flex items-center gap-1 text-rose-400">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span> 废弃: {discardCount}
                </span>
              </div>
            )}
          </div>
        )}

      </div>
    </header>
  );
};
