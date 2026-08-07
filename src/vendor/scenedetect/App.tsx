import React, { useState, useEffect, useRef } from 'react';
import { 
  Header 
} from './components/Header';
import { 
  VideoPlayer 
} from './components/VideoPlayer';
import { 
  Timeline 
} from './components/Timeline';
import { 
  ShotInspector 
} from './components/ShotInspector';
import { 
  ShotList 
} from './components/ShotList';
import { 
  AnalysisModal 
} from './components/AnalysisModal';
import { 
  ExportModal 
} from './components/ExportModal';
import { ShotPreviewOverlay } from './components/ShotPreviewOverlay';
import { ProjectManager } from './components/ProjectManager';

import { 
  AnalysisStatus, 
  Shot, 
  VideoMetadata, 
  ShotStatus 
} from './types';
import { 
  SAMPLE_VIDEOS, 
  SampleVideoPreset,
  generateKeyframeSvg
} from './utils/sampleVideos';
import { 
  analyzeVideoShots,
  captureVideoFrame,
  captureShotKeyframes,
  getDefaultKeyframeFrames,
  regenerateProjectKeyframes,
  saveProjectToServer,
} from './utils/sceneDetector';
import { 
  frameToTimecode 
} from './utils/timecode';
import { exportSceneDetectProject } from './utils/export';
import {
  createProject,
  deleteRecentProject,
  listRecentProjects,
  loadDraft,
  RecentProject,
  saveDraft,
  saveRecentProject,
  SceneDetectProject,
  projectToMetadata,
} from './utils/projectStore';

export default function App() {
  // Application Main State
  const [status, setStatus] = useState<AnalysisStatus>('analyzed_review');
  const [metadata, setMetadata] = useState<VideoMetadata | null>(SAMPLE_VIDEOS[0].metadata);
  const [shots, setShots] = useState<Shot[]>(SAMPLE_VIDEOS[0].shots);
  const [activeShotId, setActiveShotId] = useState<string | null>(SAMPLE_VIDEOS[0].shots[0]?.id || null);
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);
  const [previewShot, setPreviewShot] = useState<Shot | null>(null);
  const [projectRecord, setProjectRecord] = useState<SceneDetectProject | null>(() =>
    createProject('示例项目', SAMPLE_VIDEOS[0].metadata, SAMPLE_VIDEOS[0].shots, 'analyzed_review', 0, SAMPLE_VIDEOS[0].shots[0]?.id || null),
  );
  const [projectName, setProjectName] = useState('示例项目');
  const [isProjectDirty, setIsProjectDirty] = useState(false);
  const [isProjectManagerOpen, setIsProjectManagerOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [isRestoringRecentProject, setIsRestoringRecentProject] = useState(true);

  // Modals state
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Analysis progress tracking
  const [analysisPhase, setAnalysisPhase] = useState(1);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [stageMessage, setStageMessage] = useState('');
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(15);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Undo / Redo Stacks
  const [undoStack, setUndoStack] = useState<Shot[][]>([]);
  const [redoStack, setRedoStack] = useState<Shot[][]>([]);

  // Hidden File Input Ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentProject = React.useMemo(
    () => metadata
      ? createProject(projectName, metadata, shots, status, currentFrame, activeShotId, projectRecord || undefined)
      : projectRecord,
    [metadata, shots, status, currentFrame, activeShotId, projectName, projectRecord],
  );

  useEffect(() => {
    if (!currentProject || !isProjectDirty) return;
    const timer = window.setTimeout(() => {
      saveDraft(currentProject).then(() => saveRecentProject(currentProject)).then(() => {
        listRecentProjects().then(setRecentProjects).catch(() => undefined);
      }).catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [currentProject, isProjectDirty]);

  const markProjectDirty = () => setIsProjectDirty(true);
  const handleSeekFrame = (frame: number) => {
    setCurrentFrame(frame);
    markProjectDirty();
  };

  // Helper to push history state before changing shots
  const pushHistory = (currentShots: Shot[]) => {
    setUndoStack((prev) => [...prev, currentShots]);
    setRedoStack([]); // clear redo stack on new edit
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previousShots = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, shots]);
    setShots(previousShots);
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    setStatus('adjusted');
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const nextShots = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, shots]);
    setShots(nextShots);
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setStatus('adjusted');
  };

  // Select Sample Preset Video
  const handleSelectSample = (preset: SampleVideoPreset) => {
    setIsPlaying(false);
    setPendingVideoFile(null);
    setMetadata(preset.metadata);
    setShots(preset.shots);
    setActiveShotId(preset.shots[0]?.id || null);
    setCurrentFrame(0);
    setStatus('analyzed_review');
    setUndoStack([]);
    setRedoStack([]);
    const nextProject = createProject(preset.name, preset.metadata, preset.shots, 'analyzed_review', 0, preset.shots[0]?.id || null);
    setProjectRecord(nextProject);
    setProjectName(nextProject.project.name);
    setIsProjectDirty(true);
  };

  // Local Video File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Allow selecting the same file again after an analysis or a failed upload.
    e.target.value = '';

    setIsPlaying(false);
    setPendingVideoFile(file);

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = objectUrl;
    video.preload = 'metadata';

    await new Promise<void>((resolve) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => resolve();
    });

    const duration = video.duration || 60;
    const fps = 30;
    const totalFrames = Math.floor(duration * fps);

    const newMeta: VideoMetadata = {
      name: file.name,
      size: file.size,
      duration,
      fps,
      width: video.videoWidth || 1920,
      height: video.videoHeight || 1080,
      url: objectUrl,
      totalFrames,
      isSample: false,
    };

    setMetadata(newMeta);
    setShots([]);
    setActiveShotId(null);
    setCurrentFrame(0);
    setStatus('uploaded_pending'); // Uploaded, awaiting user confirmation
    const nextProject = createProject(file.name.replace(/\.[^/.]+$/, '') || '未命名项目', newMeta, [], 'uploaded_pending', 0, null);
    setProjectRecord(nextProject);
    setProjectName(nextProject.project.name);
    setIsProjectDirty(true);
  };

  // Start Scene Detection Analysis Process
  const handleStartAnalysis = async () => {
    if (!metadata) return;

    setIsPlaying(false);
    setStatus('analyzing');
    setAnalysisError(null);
    setIsAnalysisModalOpen(true);
    setAnalysisProgress(5);
    setAnalysisPhase(1);
    setStageMessage('准备分析视频...');

    try {
      const source = pendingVideoFile || metadata.url;
      const result = await analyzeVideoShots(source, (phase, progress, msg) => {
        setAnalysisPhase(phase);
        setAnalysisProgress(progress);
        setStageMessage(msg);
        setEstimatedTimeRemaining(Math.max(1, Math.round((100 - progress) / 6)));
      });

      setMetadata(result.metadata);
      setShots(result.shots);
      setActiveShotId(result.shots[0]?.id || null);
      setCurrentFrame(0);
      setStatus('analyzed_review');
      setUndoStack([]);
      setRedoStack([]);
      setProjectRecord((previous) => createProject(projectName, result.metadata, result.shots, 'analyzed_review', 0, result.shots[0]?.id || null, previous || undefined));
      setIsProjectDirty(true);
    } catch (err) {
      console.error('Analysis error', err);
      const message = err instanceof Error ? err.message : '镜头分析失败，请检查后端服务是否已启动。';
      setAnalysisError(message);
      setStatus('uploaded_pending');
    } finally {
      setIsAnalysisModalOpen(false);
    }
  };

  // Active Shot Selection
  const activeShot = shots.find((s) => s.id === activeShotId) || null;

  // Single Shot Boundary/Data Update Handler
  const handleUpdateShot = async (updatedShot: Shot) => {
    pushHistory(shots);
    const updatedIndex = shots.findIndex((s) => s.id === updatedShot.id);
    if (updatedIndex === -1) return;
    const fps = metadata?.fps || 30;
    const boundaryChanged =
      updatedShot.startFrame !== shots[updatedIndex].startFrame ||
      updatedShot.endFrame !== shots[updatedIndex].endFrame;
    const normalizedUpdatedShot = boundaryChanged
      ? { ...updatedShot, keyframeFrames: getDefaultKeyframeFrames(updatedShot), keyframeSource: 'AI' as const }
      : updatedShot;
    const withRange = (shot: Shot, startFrame: number, endFrame: number): Shot => {
      const durationFrames = endFrame - startFrame + 1;
      return {
        ...shot,
        startFrame,
        endFrame,
        startTimecode: frameToTimecode(startFrame, fps),
        endTimecode: frameToTimecode(endFrame, fps),
        durationFrames,
        duration: durationFrames / fps,
        keyframeFrames: { first: startFrame, middle: Math.floor((startFrame + endFrame) / 2), last: endFrame },
        keyframeSource: 'AI',
      };
    };
    const newShots = shots.map((shot, index) => {
      if (index === updatedIndex) return normalizedUpdatedShot;
      if (index === updatedIndex - 1 && normalizedUpdatedShot.startFrame !== shot.startFrame) {
        return withRange(shot, shot.startFrame, normalizedUpdatedShot.startFrame - 1);
      }
      if (index === updatedIndex + 1 && normalizedUpdatedShot.endFrame !== shot.endFrame) {
        return withRange(shot, normalizedUpdatedShot.endFrame + 1, shot.endFrame);
      }
      return shot;
    });

    const changedIndices = [updatedIndex];
    if (!boundaryChanged) {
      setShots(newShots);
      setStatus('adjusted');
      markProjectDirty();
      return;
    }
    if (updatedIndex > 0 && normalizedUpdatedShot.startFrame !== shots[updatedIndex].startFrame) changedIndices.push(updatedIndex - 1);
    if (updatedIndex < shots.length - 1 && normalizedUpdatedShot.endFrame !== shots[updatedIndex].endFrame) changedIndices.push(updatedIndex + 1);
    const refreshedShots = await Promise.all(newShots.map(async (shot, index) => {
      if (!changedIndices.includes(index) || !metadata?.url) return shot;
      try {
        return { ...shot, ...(await captureShotKeyframes(metadata.url, shot, fps)) };
      } catch {
        return shot;
      }
    }));
    setShots(refreshedShots);
    setStatus('adjusted');
    markProjectDirty();
  };

  // Play Shot Range
  const handlePlayShot = (shot: Shot) => {
    setActiveShotId(shot.id);
    handleSeekFrame(shot.startFrame);
    setIsPlaying(true);
  };

  const handlePreviewShot = (shot: Shot) => {
    setPreviewShot(shot);
  };

  // Split Shot At Frame
  const handleSplitShotAtFrame = (shotId: string, splitFrame?: number) => {
    const targetShotIndex = shots.findIndex((s) => s.id === shotId);
    if (targetShotIndex === -1) return;

    const targetShot = shots[targetShotIndex];
    const frameToSplit = splitFrame !== undefined ? splitFrame : currentFrame;

    if (frameToSplit <= targetShot.startFrame || frameToSplit >= targetShot.endFrame) {
      return; // Cannot split outside shot boundary
    }

    pushHistory(shots);

    const fps = metadata?.fps || 30;

    // First half shot
    const shot1End = frameToSplit - 1;
    const shot1DurationFrames = shot1End - targetShot.startFrame + 1;
    const shot1Duration = shot1DurationFrames / fps;
    const shot1EndTimecode = frameToTimecode(shot1End, fps);

    const shot1: Shot = {
      ...targetShot,
      endFrame: shot1End,
      endTimecode: shot1EndTimecode,
      duration: shot1Duration,
      durationFrames: shot1DurationFrames,
      modifiedSource: 'USER',
      lastFrameUrl: generateKeyframeSvg(targetShot.shotNumber, '尾帧', shot1EndTimecode, 'cyan'),
      keyframeFrames: { first: targetShot.startFrame, middle: Math.floor((targetShot.startFrame + shot1End) / 2), last: shot1End },
      keyframeSource: 'AI',
    };

    // Second half shot
    const shot2Start = frameToSplit;
    const shot2DurationFrames = targetShot.endFrame - shot2Start + 1;
    const shot2Duration = shot2DurationFrames / fps;
    const shot2StartTimecode = frameToTimecode(shot2Start, fps);

    const shot2: Shot = {
      ...targetShot,
      id: `shot-${Date.now()}-split`,
      shotNumber: targetShot.shotNumber + 1,
      startFrame: shot2Start,
      startTimecode: shot2StartTimecode,
      duration: shot2Duration,
      durationFrames: shot2DurationFrames,
      modifiedSource: 'USER',
      firstFrameUrl: generateKeyframeSvg(targetShot.shotNumber + 1, '首帧', shot2StartTimecode, 'purple'),
      keyframeFrames: { first: shot2Start, middle: Math.floor((shot2Start + targetShot.endFrame) / 2), last: targetShot.endFrame },
      keyframeSource: 'AI',
    };

    // Re-index shot numbers
    const updatedShots = [
      ...shots.slice(0, targetShotIndex),
      shot1,
      shot2,
      ...shots.slice(targetShotIndex + 1),
    ].map((s, idx) => ({ ...s, shotNumber: idx + 1 }));

    setShots(updatedShots);
    setActiveShotId(shot1.id);
    setStatus('adjusted');
    markProjectDirty();
  };

  // Merge Two Adjacent Shots
  const handleMergeShots = (shotId1: string, shotId2: string) => {
    const idx1 = shots.findIndex((s) => s.id === shotId1);
    const idx2 = shots.findIndex((s) => s.id === shotId2);
    if (idx1 === -1 || idx2 === -1) return;

    const s1 = shots[Math.min(idx1, idx2)];
    const s2 = shots[Math.max(idx1, idx2)];

    pushHistory(shots);

    const fps = metadata?.fps || 30;
    const durationFrames = s2.endFrame - s1.startFrame + 1;
    const duration = durationFrames / fps;

    const mergedShot: Shot = {
      ...s1,
      endFrame: s2.endFrame,
      endTimecode: s2.endTimecode,
      duration,
      durationFrames,
      lastFrameUrl: s2.lastFrameUrl,
      tags: Array.from(new Set([...s1.tags, ...s2.tags])),
      notes: `${s1.notes} | ${s2.notes}`.trim(),
      modifiedSource: 'USER',
      keyframeFrames: { first: s1.startFrame, middle: Math.floor((s1.startFrame + s2.endFrame) / 2), last: s2.endFrame },
      keyframeSource: 'AI',
    };

    const remainingShots = shots
      .filter((s) => s.id !== s1.id && s.id !== s2.id)
      .concat(mergedShot)
      .sort((a, b) => a.startFrame - b.startFrame)
      .map((s, idx) => ({ ...s, shotNumber: idx + 1 }));

    setShots(remainingShots);
    setActiveShotId(mergedShot.id);
    setStatus('adjusted');
    markProjectDirty();
  };

  const handleMergeIntoPrevious = (shotId: string) => {
    const index = shots.findIndex((shot) => shot.id === shotId);
    if (index > 0) handleMergeKeepingShot(shots[index - 1].id, shotId);
  };

  const handleMergeIntoNext = (shotId: string) => {
    const index = shots.findIndex((shot) => shot.id === shotId);
    if (index >= 0 && index < shots.length - 1) handleMergeKeepingShot(shots[index + 1].id, shotId);
  };

  const handleMergeKeepingShot = (survivorId: string, removedId: string) => {
    const survivorIndex = shots.findIndex((shot) => shot.id === survivorId);
    const removedIndex = shots.findIndex((shot) => shot.id === removedId);
    if (survivorIndex < 0 || removedIndex < 0) return;
    const first = shots[Math.min(survivorIndex, removedIndex)];
    const second = shots[Math.max(survivorIndex, removedIndex)];
    pushHistory(shots);
    const fps = metadata?.fps || 30;
    const durationFrames = second.endFrame - first.startFrame + 1;
    const mergedShot = {
      ...shots[survivorIndex],
      startFrame: first.startFrame,
      endFrame: second.endFrame,
      startTimecode: frameToTimecode(first.startFrame, fps),
      endTimecode: frameToTimecode(second.endFrame, fps),
      durationFrames,
      duration: durationFrames / fps,
      firstFrameUrl: first.firstFrameUrl,
      lastFrameUrl: second.lastFrameUrl,
      tags: Array.from(new Set([...first.tags, ...second.tags])),
      notes: `${first.notes} | ${second.notes}`.trim(),
      modifiedSource: 'USER' as const,
      keyframeFrames: { first: first.startFrame, middle: Math.floor((first.startFrame + second.endFrame) / 2), last: second.endFrame },
      keyframeSource: 'AI' as const,
    };
    setShots(shots.filter((shot) => shot.id !== survivorId && shot.id !== removedId).concat(mergedShot).sort((a, b) => a.startFrame - b.startFrame).map((shot, index) => ({ ...shot, shotNumber: index + 1 })));
    setActiveShotId(mergedShot.id);
    setStatus('adjusted');
    markProjectDirty();
  };

  // Delete Single Shot
  const handleDeleteShot = (shotId: string) => {
    pushHistory(shots);
    const remaining = shots
      .filter((s) => s.id !== shotId)
      .map((s, idx) => ({ ...s, shotNumber: idx + 1 }));
    setShots(remaining);
    if (activeShotId === shotId) {
      setActiveShotId(remaining[0]?.id || null);
    }
    setStatus('adjusted');
    markProjectDirty();
  };

  // Batch Delete Shots
  const handleBatchDelete = (shotIds: string[]) => {
    pushHistory(shots);
    const remaining = shots
      .filter((s) => !shotIds.includes(s.id))
      .map((s, idx) => ({ ...s, shotNumber: idx + 1 }));
    setShots(remaining);
    if (shotIds.includes(activeShotId || '')) {
      setActiveShotId(remaining[0]?.id || null);
    }
    setStatus('adjusted');
    markProjectDirty();
  };

  // Batch Change Shot Status
  const handleBatchStatusChange = (shotIds: string[], newStatus: ShotStatus) => {
    pushHistory(shots);
    const updated = shots.map((s) =>
      shotIds.includes(s.id) ? { ...s, status: newStatus, modifiedSource: 'USER' as const } : s
    );
    setShots(updated);
    setStatus('adjusted');
    markProjectDirty();
  };

  const handleNewProject = () => {
    if (isProjectDirty && !window.confirm('当前项目有未保存修改，确定新建项目吗？')) return;
    setIsPlaying(false);
    setMetadata(null);
    setShots([]);
    setActiveShotId(null);
    setCurrentFrame(0);
    setPendingVideoFile(null);
    setStatus('idle');
    setProjectRecord(null);
    setProjectName('未命名项目');
    setIsProjectDirty(false);
    setIsProjectManagerOpen(false);
  };

  const handleSaveProject = (name: string, saveAs: boolean) => {
    if (!currentProject) return;
    const now = new Date().toISOString();
    const projectToSave: SceneDetectProject = {
      ...currentProject,
      project: {
        ...currentProject.project,
        id: saveAs ? crypto.randomUUID() : currentProject.project.id,
        name: name.trim() || currentProject.project.name,
        updatedAt: now,
        createdAt: saveAs ? now : currentProject.project.createdAt,
      },
    };
    setProjectName(projectToSave.project.name);
    setProjectRecord(projectToSave);
    setIsProjectDirty(false);
    saveProjectToServer(projectToSave).then(() => {
      saveRecentProject(projectToSave).then(() => listRecentProjects().then(setRecentProjects)).catch(() => undefined);
    }).catch(() => {
      exportSceneDetectProject(projectToSave);
      window.alert('后端项目目录暂时不可用，已将项目配置下载到浏览器默认下载目录。');
    });
  };

  const handleOpenProject = async (project: SceneDetectProject, selectedFile?: File): Promise<boolean> => {
    let file = selectedFile;
    if (!file && project.source.videoUrl) {
      try {
        const response = await fetch(project.source.videoUrl);
        if (response.ok) {
          const blob = await response.blob();
          file = new File([blob], project.source.fileName, { type: blob.type || 'video/mp4' });
        }
      } catch {
        // Fall through to the source file picker.
      }
    }
    if (!file) return false;
    const isLegacyInputName = /^input\.[^/]+$/i.test(project.source.fileName);
    if ((!isLegacyInputName && file.name !== project.source.fileName) || file.size !== project.source.size) {
      window.alert(`原视频不匹配，请选择“${project.source.fileName}”（文件大小应为 ${project.source.size} 字节）。`);
      return false;
    }
    const normalizedProject = isLegacyInputName
      ? { ...project, source: { ...project.source, fileName: file.name, videoUrl: project.source.videoUrl } }
      : project;
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = objectUrl;
    video.preload = 'metadata';
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('无法读取所选视频'));
      });
      if (Math.abs((video.duration || 0) - project.source.duration) > 0.5) {
        throw new Error('所选视频时长与项目记录不匹配');
      }
      const fps = project.source.fps || 30;
      let restoredShots: Shot[];
      try {
        restoredShots = await Promise.all(project.shots.map(async (shot) => {
          return { ...shot, ...(await captureShotKeyframes(objectUrl, shot, fps)) };
        }));
      } catch {
        restoredShots = await regenerateProjectKeyframes(file, project.shots);
      }
      const restoredMetadata = projectToMetadata(normalizedProject, objectUrl);
      setIsPlaying(false);
      setMetadata(restoredMetadata);
      setPendingVideoFile(file);
      setShots(restoredShots);
      setActiveShotId(normalizedProject.view.activeShotId || restoredShots[0]?.id || null);
      setCurrentFrame(normalizedProject.view.currentFrame);
      setStatus(normalizedProject.analysis.status === 'idle' ? 'analyzed_review' : normalizedProject.analysis.status);
      setProjectRecord(normalizedProject);
      setProjectName(normalizedProject.project.name);
      setIsProjectDirty(false);
      setUndoStack([]);
      setRedoStack([]);
      return true;
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      window.alert(error instanceof Error ? error.message : '项目恢复失败');
      return false;
    }
  };

  // Restore the newest local project on startup. The saved media URL is used first;
  // the project manager is only opened when the source can no longer be reached.
  useEffect(() => {
    let cancelled = false;
    const restoreRecentProject = async () => {
      try {
        const [projects, draft] = await Promise.all([listRecentProjects(), loadDraft()]);
        const merged = new Map<string, RecentProject>(projects.map((item) => [item.id, item]));
        if (draft) {
          const existing = merged.get(draft.project.id);
          if (!existing || draft.project.updatedAt > existing.updatedAt) {
            merged.set(draft.project.id, {
              id: draft.project.id,
              name: draft.project.name,
              sourceFileName: draft.source.fileName,
              updatedAt: draft.project.updatedAt,
              shotCount: draft.shots.length,
              status: draft.analysis.status,
              project: draft,
            });
          }
        }
        const orderedProjects = [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (cancelled) return;
        setRecentProjects(orderedProjects);

        const latest = orderedProjects[0];
        if (latest) {
          const opened = await handleOpenProject(latest.project);
          if (!opened && !cancelled) setIsProjectManagerOpen(true);
        }
      } catch {
        // Keep the sample workspace available when local storage is unavailable.
      } finally {
        if (!cancelled) setIsRestoringRecentProject(false);
      }
    };
    restoreRecentProject();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased flex flex-col">
      {isRestoringRecentProject && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 backdrop-blur-sm">
          <div className="rounded-xl border border-slate-700 bg-slate-900 px-5 py-4 text-center shadow-2xl">
            <div className="text-sm font-semibold text-slate-100">正在恢复最近项目</div>
            <div className="mt-1 text-xs text-slate-400">正在自动连接原视频，请稍候...</div>
          </div>
        </div>
      )}
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        id="video-upload"
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/m4v"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Header Navigation */}
      <Header
        status={status}
        metadata={metadata}
        shots={shots}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onUploadClick={() => fileInputRef.current?.click()}
        onSelectSample={handleSelectSample}
        onStartAnalysis={handleStartAnalysis}
        projectName={projectName}
        isProjectDirty={isProjectDirty}
        onProjectClick={() => setIsProjectManagerOpen(true)}
        onExportClick={() => setIsExportModalOpen(true)}
      />

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        
        {/* Upper Stage: Video Player (Left) + Shot Detail Inspector Panel (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Player (7 cols on lg screens) */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <VideoPlayer
              metadata={metadata}
              shots={shots}
              currentFrame={currentFrame}
              activeShot={activeShot}
              isPlaying={isPlaying}
              onPlayPause={() => setIsPlaying(!isPlaying)}
              onSeekFrame={handleSeekFrame}
              onSplitShotAtFrame={(frame) => {
                if (activeShot) handleSplitShotAtFrame(activeShot.id, frame);
              }}
            />
          </div>

          {/* Right Column: Active Shot Detail Inspector Panel (5 cols on lg screens) */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <ShotInspector
              shot={activeShot}
              fps={metadata?.fps || 30}
              totalFrames={metadata?.totalFrames || 0}
              currentFrame={currentFrame}
              videoUrl={metadata?.url || ''}
              onUpdateShot={handleUpdateShot}
              onPlayShot={handlePlayShot}
              onSeekFrame={handleSeekFrame}
              onSplitShot={(id) => handleSplitShotAtFrame(id, currentFrame)}
              onMergeShots={handleMergeShots}
              onDeleteShot={handleDeleteShot}
            />
          </div>

        </div>

        {/* Middle Stage: Proportional Timeline */}
        <Timeline
          metadata={metadata}
          shots={shots}
          activeShotId={activeShotId}
          currentFrame={currentFrame}
          onSelectShot={(shot) => setActiveShotId(shot.id)}
          onSeekFrame={handleSeekFrame}
          onSplitShot={(id, splitFrame) => handleSplitShotAtFrame(id, splitFrame)}
          onMergeIntoNext={handleMergeIntoNext}
          onDeleteShot={handleDeleteShot}
        />

        {/* Lower Stage: Shot Results List & Grid View */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
              镜头分类与关键帧列表 (Shot List & Keyframe Review)
            </h2>
          </div>

          <ShotList
            shots={shots}
            fps={metadata?.fps || 30}
            activeShotId={activeShotId}
            onSelectShot={(shot) => setActiveShotId(shot.id)}
            onPreviewShot={handlePreviewShot}
            onSeekFrame={handleSeekFrame}
            onSplitShot={(id) => handleSplitShotAtFrame(id, currentFrame)}
            onSplitShotAtFrame={handleSplitShotAtFrame}
            onUpdateShot={handleUpdateShot}
            totalFrames={metadata?.totalFrames || 0}
            videoUrl={metadata?.url || ''}
            onMergeShots={handleMergeShots}
            onMergePrevious={handleMergeIntoPrevious}
            onMergeNext={handleMergeIntoNext}
            onDeleteShot={handleDeleteShot}
            onBatchDelete={handleBatchDelete}
            onBatchStatusChange={handleBatchStatusChange}
          />
        </div>

      </main>

      {/* Analysis Progress Modal */}
      <AnalysisModal
        isOpen={isAnalysisModalOpen}
        fileName={metadata?.name || 'video.mp4'}
        currentPhase={analysisPhase}
        progressPercent={analysisProgress}
        stageMessage={stageMessage}
        estimatedSecondsRemaining={estimatedTimeRemaining}
      />

      {analysisError && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md rounded-xl border border-rose-500/40 bg-rose-950/95 px-4 py-3 text-sm text-rose-100 shadow-2xl">
          <div className="flex items-start gap-3">
            <span className="font-semibold text-rose-300">镜头分析失败</span>
            <button
              type="button"
              onClick={() => setAnalysisError(null)}
              className="ml-auto text-rose-300 hover:text-white"
              aria-label="关闭错误提示"
            >
              ×
            </button>
          </div>
          <p className="mt-1 text-xs text-rose-200/80">{analysisError}</p>
        </div>
      )}

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        shots={shots}
        metadata={metadata}
        onClose={() => setIsExportModalOpen(false)}
            onExportSuccess={() => setStatus('exported')}
          />

      <ProjectManager
        isOpen={isProjectManagerOpen}
        currentProject={currentProject}
        recentProjects={recentProjects}
        isDirty={isProjectDirty}
        onClose={() => setIsProjectManagerOpen(false)}
        onNewProject={handleNewProject}
        onOpenProject={handleOpenProject}
        onSaveProject={handleSaveProject}
        onDeleteRecent={(id) => {
          deleteRecentProject(id).then(() => listRecentProjects().then(setRecentProjects)).catch(() => undefined);
        }}
      />

      {previewShot && metadata && (
        <ShotPreviewOverlay
          shot={previewShot}
          metadata={metadata}
          onClose={() => setPreviewShot(null)}
        />
      )}
    </div>
  );
}
