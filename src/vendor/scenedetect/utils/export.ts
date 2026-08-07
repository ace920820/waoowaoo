import JSZip from 'jszip';
import { AnalysisStatus, Shot, VideoMetadata } from '../types';
import { SceneDetectProject } from './projectStore';

export interface ProjectConfig {
  schemaVersion: 1;
  type: 'scenedetect-project';
  savedAt: string;
  video: VideoMetadata & { videoPath: string; sourceFileName: string };
  analysis: {
    detector: 'pySceneDetect';
    detectorType: 'content';
    threshold: number;
    status: AnalysisStatus;
    currentFrame: number;
  };
  shots: Shot[];
}

/**
 * Download a file in browser
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate CSV data and trigger download
 */
export function exportShotsToCSV(shots: Shot[], metadata?: VideoMetadata) {
  const headers = [
    '镜头编号',
    '起始帧',
    '结束帧',
    '总帧数',
    '首帧文件名',
    '中间帧文件名',
    '尾帧文件名',
    '起始时间码',
    '结束时间码',
    '持续时间(秒)',
    '镜头状态',
    '修改来源',
    '标签',
    '备注/说明',
    'AI置信度',
  ];

  const rows = shots.map((shot) => [
    `镜头 ${String(shot.shotNumber).padStart(2, '0')}`,
    shot.startFrame,
    shot.endFrame,
    shot.durationFrames,
    `Shot_${String(shot.shotNumber).padStart(2, '0')}_First.jpg`,
    `Shot_${String(shot.shotNumber).padStart(2, '0')}_Mid.jpg`,
    `Shot_${String(shot.shotNumber).padStart(2, '0')}_Last.jpg`,
    shot.startTimecode,
    shot.endTimecode,
    shot.duration.toFixed(3),
    shot.status === 'keep' ? '保留' : shot.status === 'discard' ? '废弃' : '待确认',
    shot.modifiedSource === 'USER' ? '人工已修改' : '算法检测',
    `"${shot.tags.join(', ')}"`,
    `"${(shot.notes || '').replace(/"/g, '""')}"`,
    shot.confidence ? `${(shot.confidence * 100).toFixed(0)}%` : '-',
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const filename = `${metadata?.name ? metadata.name.replace(/\.[^/.]+$/, '') : 'Shot_Analysis'}_镜头切分清单.csv`;
  downloadBlob(blob, filename);
}

/**
 * Export JSON Specification
 */
export function exportShotsToJSON(shots: Shot[], metadata?: VideoMetadata) {
  const exportData = {
    app: 'Video Shot Analysis Workbench',
    exportTime: new Date().toISOString(),
    videoMetadata: metadata,
    totalShots: shots.length,
    shots: shots.map((s) => ({
      shotNumber: s.shotNumber,
      startFrame: s.startFrame,
      endFrame: s.endFrame,
      rawStartFrame: s.rawStartFrame,
      rawEndFrame: s.rawEndFrame,
      startTimecode: s.startTimecode,
      endTimecode: s.endTimecode,
      durationSeconds: s.duration,
      durationFrames: s.durationFrames,
      status: s.status,
      modifiedSource: s.modifiedSource,
      tags: s.tags,
      notes: s.notes,
      keyframes: {
        firstFrame: `Shot_${String(s.shotNumber).padStart(2, '0')}_First.jpg`,
        middleFrame: `Shot_${String(s.shotNumber).padStart(2, '0')}_Mid.jpg`,
        lastFrame: `Shot_${String(s.shotNumber).padStart(2, '0')}_Last.jpg`,
      },
    })),
  };

  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const filename = `${metadata?.name ? metadata.name.replace(/\.[^/.]+$/, '') : 'Shot_Analysis'}_镜头数据.json`;
  downloadBlob(blob, filename);
}

export function exportProjectConfig(
  shots: Shot[],
  metadata: VideoMetadata,
  status: AnalysisStatus,
  currentFrame: number,
) {
  const config: ProjectConfig = {
    schemaVersion: 1,
    type: 'scenedetect-project',
    savedAt: new Date().toISOString(),
    video: {
      ...metadata,
      videoPath: metadata.url,
      sourceFileName: metadata.name,
    },
    analysis: {
      detector: 'pySceneDetect',
      detectorType: 'content',
      threshold: 27,
      status,
      currentFrame,
    },
    shots,
  };
  const json = JSON.stringify(config, null, 2);
  const baseName = metadata.name.replace(/\.[^/.]+$/, '') || 'SceneDetect_Project';
  downloadBlob(new Blob([json], { type: 'application/json' }), `${baseName}_SceneDetect项目配置.json`);
}

export function exportSceneDetectProject(project: SceneDetectProject) {
  const baseName = project.project.name || project.source.fileName.replace(/\.[^/.]+$/, '') || 'SceneDetect_Project';
  downloadBlob(
    new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
    `${baseName}.scenedetect.json`,
  );
}

export async function readProjectConfig(file: File): Promise<ProjectConfig> {
  const parsed = JSON.parse(await file.text()) as Partial<ProjectConfig>;
  if (
    parsed.type !== 'scenedetect-project' ||
    parsed.schemaVersion !== 1 ||
    !parsed.video ||
    !parsed.analysis ||
    parsed.analysis.detector !== 'pySceneDetect' ||
    parsed.analysis.detectorType !== 'content' ||
    !Array.isArray(parsed.shots)
  ) {
    throw new Error('不是有效的 SceneDetect 项目配置文件');
  }
  return parsed as ProjectConfig;
}

export async function readSceneDetectProject(file: File): Promise<SceneDetectProject> {
  const parsed = JSON.parse(await file.text()) as {
    type?: string;
    schemaVersion?: number;
    savedAt?: string;
    video?: VideoMetadata;
    analysis?: {
      detector?: string;
      detectorType?: string;
      threshold?: number;
      status?: AnalysisStatus;
      currentFrame?: number;
    };
    project?: SceneDetectProject['project'];
    source?: SceneDetectProject['source'];
    view?: SceneDetectProject['view'];
    shots?: Shot[];
  };
  if (parsed.type !== 'scenedetect-project') throw new Error('不是有效的 SceneDetect 项目文件');
  if (parsed.schemaVersion === 1) {
    if (!parsed.video || !Array.isArray(parsed.shots)) throw new Error('旧版项目文件缺少视频或镜头数据');
    const now = new Date().toISOString();
    return {
      schemaVersion: 2,
      type: 'scenedetect-project',
      project: {
        id: crypto.randomUUID(),
        name: parsed.video.name.replace(/\.[^/.]+$/, '') || '导入项目',
        createdAt: parsed.savedAt || now,
        updatedAt: now,
      },
      source: {
        fileName: parsed.video.name,
        size: parsed.video.size,
        duration: parsed.video.duration,
        fps: parsed.video.fps,
        width: parsed.video.width,
        height: parsed.video.height,
        totalFrames: parsed.video.totalFrames,
        videoUrl: parsed.video.url.startsWith('blob:') || parsed.video.url.startsWith('data:') ? undefined : parsed.video.url,
      },
      analysis: {
        detector: 'pySceneDetect',
        detectorType: 'content',
        threshold: parsed.analysis?.threshold || 27,
        analyzedAt: parsed.savedAt || now,
        status: parsed.analysis?.status || 'analyzed_review',
      },
      view: { currentFrame: parsed.analysis?.currentFrame || 0, activeShotId: parsed.shots[0]?.id || null },
      shots: parsed.shots,
    };
  }
  if (parsed.schemaVersion !== 2 || !parsed.project || !parsed.source || !parsed.analysis || !parsed.view || !Array.isArray(parsed.shots)) {
    throw new Error('项目文件版本不受支持或数据不完整');
  }
  if (parsed.analysis.detector !== 'pySceneDetect' || parsed.analysis.detectorType !== 'content') {
    throw new Error('项目文件不是由 pySceneDetect 生成的');
  }
  return parsed as unknown as SceneDetectProject;
}

/**
 * Convert Data URL or Image URL to Uint8Array Blob for JSZip
 */
async function urlToBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    const parts = url.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  const response = await fetch(url);
  return await response.blob();
}

/**
 * Package all keyframes into a ZIP file with JSZip
 */
export async function exportKeyframesZIP(
  shots: Shot[],
  metadata?: VideoMetadata,
  onProgress?: (percent: number) => void
) {
  const zip = new JSZip();
  const folder = zip.folder('keyframes') || zip;

  let count = 0;
  const total = shots.length * 3;

  for (const shot of shots) {
    const shotNumStr = String(shot.shotNumber).padStart(2, '0');

    // First Frame
    try {
      const blob1 = await urlToBlob(shot.firstFrameUrl);
      folder.file(`Shot_${shotNumStr}_First.jpg`, blob1);
      count++;
      if (onProgress) onProgress(Math.floor((count / total) * 100));
    } catch (e) {
      console.warn('Failed to zip first frame', e);
    }

    // Mid Frame
    try {
      const blob2 = await urlToBlob(shot.middleFrameUrl);
      folder.file(`Shot_${shotNumStr}_Mid.jpg`, blob2);
      count++;
      if (onProgress) onProgress(Math.floor((count / total) * 100));
    } catch (e) {
      console.warn('Failed to zip mid frame', e);
    }

    // Last Frame
    try {
      const blob3 = await urlToBlob(shot.lastFrameUrl);
      folder.file(`Shot_${shotNumStr}_Last.jpg`, blob3);
      count++;
      if (onProgress) onProgress(Math.floor((count / total) * 100));
    } catch (e) {
      console.warn('Failed to zip last frame', e);
    }
  }

  // Also include CSV inside ZIP
  const headers = [
    '镜头编号,起始帧,结束帧,首帧文件名,中间帧文件名,尾帧文件名,起始时间码,结束时间码,时长(秒),标签,状态',
  ];
  const csvLines = shots.map(
    (s) =>
      `Shot_${String(s.shotNumber).padStart(2, '0')},${s.startFrame},${s.endFrame},Shot_${String(s.shotNumber).padStart(2, '0')}_First.jpg,Shot_${String(s.shotNumber).padStart(2, '0')}_Mid.jpg,Shot_${String(s.shotNumber).padStart(2, '0')}_Last.jpg,${s.startTimecode},${s.endTimecode},${s.duration.toFixed(3)},"${s.tags.join('|')}",${s.status}`
  );
  folder.file('manifest.csv', '\uFEFF' + [...headers, ...csvLines].join('\n'));

  const zipContent = await zip.generateAsync({ type: 'blob' });
  const filename = `${metadata?.name ? metadata.name.replace(/\.[^/.]+$/, '') : 'Keyframes'}_关键帧打包.zip`;
  downloadBlob(zipContent, filename);
}
