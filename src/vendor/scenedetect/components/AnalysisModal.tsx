import React from 'react';
import { Film, CheckCircle2, Loader2, Sparkles } from 'lucide-react';

interface AnalysisModalProps {
  isOpen: boolean;
  fileName: string;
  currentPhase: number;
  progressPercent: number;
  stageMessage: string;
  estimatedSecondsRemaining: number;
}

const STAGES = [
  { id: 1, title: '1. 视频读取', desc: '读取视频编码与帧率元数据' },
  { id: 2, title: '2. 镜头边界检测', desc: '使用 pySceneDetect ContentDetector 分析画面变化' },
  { id: 3, title: '3. 关键帧抽取', desc: '提取每个镜头的首帧、中间帧与尾帧' },
  { id: 4, title: '4. 生成预览图', desc: '绘制与转换缩略图 DataURL' },
  { id: 5, title: '5. 保存结果', desc: '整合数据模型并建立时间轴' },
];

export const AnalysisModal: React.FC<AnalysisModalProps> = ({
  isOpen,
  fileName,
  currentPhase,
  progressPercent,
  stageMessage,
  estimatedSecondsRemaining,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl flex flex-col gap-6 text-slate-100 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Icon & Title */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">镜头识别与关键帧分析中</h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">
              文件: {fileName}
            </p>
          </div>
        </div>

        {/* Big Progress Ring / Percentage Display */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-cyan-400 flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {stageMessage || '正在处理镜头...'}
            </span>
            <span className="text-white font-mono text-base font-bold">
              {progressPercent}%
            </span>
          </div>

          {/* Animated Progress Bar */}
          <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
            <div
              style={{ width: `${progressPercent}%` }}
              className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(6,182,212,0.6)]"
            ></div>
          </div>

          <div className="text-[11px] text-slate-500 text-right font-mono">
            预计剩余时间: 约 {Math.max(1, estimatedSecondsRemaining)} 秒
          </div>
        </div>

        {/* Multi-Stage Step Progress Checklist */}
        <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 flex flex-col gap-3">
          <div className="text-xs font-semibold text-slate-400 border-b border-slate-800 pb-2">
            分析阶段流程 Checklist:
          </div>

          <div className="flex flex-col gap-2.5">
            {STAGES.map((stage) => {
              const isCompleted = currentPhase > stage.id;
              const isCurrent = currentPhase === stage.id;

              return (
                <div
                  key={stage.id}
                  className={`flex items-center justify-between text-xs p-2 rounded-xl border transition-all ${
                    isCurrent
                      ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                      : isCompleted
                      ? 'bg-slate-900/60 border-slate-800/80 text-slate-400'
                      : 'bg-slate-900/20 border-slate-900 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-700 shrink-0"></div>
                    )}
                    <div>
                      <div className="font-semibold">{stage.title}</div>
                      <div className="text-[10px] text-slate-500">{stage.desc}</div>
                    </div>
                  </div>

                  {isCompleted && <span className="text-[10px] font-mono text-emerald-400">已完成</span>}
                  {isCurrent && <span className="text-[10px] font-mono text-cyan-400 font-bold">处理中</span>}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};
