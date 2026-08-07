import React, { useState } from 'react';
import { 
  X, 
  FileSpreadsheet, 
  FileCode, 
  FileArchive, 
  Film, 
  Download, 
  Loader2, 
  Check, 
  Sparkles 
} from 'lucide-react';
import { Shot, VideoMetadata } from '../types';
import { 
  exportShotsToCSV, 
  exportShotsToJSON, 
  exportKeyframesZIP,
} from '../utils/export';

interface ExportModalProps {
  isOpen: boolean;
  shots: Shot[];
  metadata: VideoMetadata | null;
  onClose: () => void;
  onExportSuccess: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  shots,
  metadata,
  onClose,
  onExportSuccess,
}) => {
  const [filterRange, setFilterRange] = useState<'all' | 'keep'>('all');
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  const targetShots = filterRange === 'keep' ? shots.filter((s) => s.status === 'keep') : shots;

  const handleExportCSV = () => {
    exportShotsToCSV(targetShots, metadata || undefined);
    onExportSuccess();
  };

  const handleExportJSON = () => {
    exportShotsToJSON(targetShots, metadata || undefined);
    onExportSuccess();
  };

  const handleExportZIP = async () => {
    setIsZipping(true);
    setZipProgress(0);
    try {
      await exportKeyframesZIP(targetShots, metadata || undefined, (percent) => {
        setZipProgress(percent);
      });
      onExportSuccess();
    } catch (e) {
      console.error('ZIP Error', e);
    } finally {
      setIsZipping(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl flex flex-col gap-6 text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">导出镜头识别与关键帧结果</h3>
              <p className="text-xs text-slate-400">请选择导出数据格式与范围</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Range Selection Filter */}
        <div>
          <label className="text-xs font-semibold text-slate-400 block mb-2">
            导出范围筛选
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setFilterRange('all')}
              className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                filterRange === 'all'
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>全部镜头 ({shots.length} 个)</span>
            </button>

            <button
              onClick={() => setFilterRange('keep')}
              className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                filterRange === 'keep'
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>仅保留镜头 ({shots.filter((s) => s.status === 'keep').length} 个)</span>
            </button>
          </div>
        </div>

        {/* Export Formats Grid */}
        <div className="flex flex-col gap-3">
          {/* Option 1: CSV */}
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between hover:border-slate-700 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">CSV 镜头切分表</div>
                <div className="text-[11px] text-slate-400">包含起止时间码、帧范围、时长、标签、备注等字段</div>
              </div>
            </div>
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shrink-0 transition-colors"
            >
              导出 CSV
            </button>
          </div>

          {/* Option 2: Keyframe Images ZIP */}
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between hover:border-slate-700 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
                <FileArchive className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">三帧关键帧图片 ZIP 打包</div>
                <div className="text-[11px] text-slate-400">按镜头编号打包下载首帧、中间帧与尾帧 High-Res 图片</div>
              </div>
            </div>
            <button
              onClick={handleExportZIP}
              disabled={isZipping}
              className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs shrink-0 transition-colors flex items-center gap-1.5"
            >
              {isZipping ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{zipProgress}%</span>
                </>
              ) : (
                <span>打包 ZIP</span>
              )}
            </button>
          </div>

          {/* Option 3: JSON */}
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex items-center justify-between hover:border-slate-700 transition-colors">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
                <FileCode className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">JSON 标准元数据</div>
                <div className="text-[11px] text-slate-400">适用于自动化集成与 AI 管道二次处理</div>
              </div>
            </div>
            <button
              onClick={handleExportJSON}
              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shrink-0 transition-colors"
            >
              导出 JSON
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
