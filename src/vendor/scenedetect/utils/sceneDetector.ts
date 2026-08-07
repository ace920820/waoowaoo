import { Shot, VideoMetadata } from '../types';
import { SceneDetectProject } from './projectStore';

export interface DetectionProgressCallback {
  (phase: number, progressPercent: number, message: string): void;
}

export async function captureVideoFrame(videoUrl: string, targetTime: number): Promise<string> {
  const video = document.createElement('video');
  video.src = videoUrl;
  video.muted = true;
  video.preload = 'metadata';
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('video metadata unavailable'));
  });
  await new Promise<void>((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error('video seek failed'));
    video.currentTime = Math.max(0, Math.min(targetTime, video.duration || targetTime));
  });
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 360;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.88);
}

export function getDefaultKeyframeFrames(shot: Shot): { first: number; middle: number; last: number } {
  return {
    first: shot.startFrame,
    middle: Math.floor((shot.startFrame + shot.endFrame) / 2),
    last: shot.endFrame,
  };
}

export async function captureShotKeyframes(
  videoUrl: string,
  shot: Shot,
  fps: number,
  frames = shot.keyframeFrames || getDefaultKeyframeFrames(shot),
): Promise<{ firstFrameUrl: string; middleFrameUrl: string; lastFrameUrl: string; keyframeFrames: typeof frames }> {
  const clamp = (frame: number) => Math.max(shot.startFrame, Math.min(shot.endFrame, Math.floor(frame)));
  const safeFrames = {
    first: clamp(frames.first),
    middle: clamp(frames.middle),
    last: clamp(frames.last),
  };
  const [firstFrameUrl, middleFrameUrl, lastFrameUrl] = await Promise.all([
    captureVideoFrame(videoUrl, safeFrames.first / fps),
    captureVideoFrame(videoUrl, safeFrames.middle / fps),
    captureVideoFrame(videoUrl, safeFrames.last / fps),
  ]);
  return { firstFrameUrl, middleFrameUrl, lastFrameUrl, keyframeFrames: safeFrames };
}

interface AnalysisApiResponse {
  analysisId: string;
  metadata: VideoMetadata;
  shots: Array<Shot & { middleFrame?: number; middleTimecode?: string }>;
  detector: string;
  threshold: number;
}

function getApiUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  return url;
}

async function toUploadableFile(videoFileOrUrl: File | string): Promise<File> {
  if (videoFileOrUrl instanceof File) return videoFileOrUrl;

  const response = await fetch(videoFileOrUrl);
  if (!response.ok) {
    throw new Error(`无法读取视频：${response.status} ${response.statusText}`);
  }
  const blob = await response.blob();
  const name = videoFileOrUrl.split('/').pop()?.split('?')[0] || 'video.mp4';
  return new File([blob], name.includes('.') ? name : `${name}.mp4`, {
    type: blob.type || 'video/mp4',
  });
}

function mapShot(shot: AnalysisApiResponse['shots'][number]): Shot {
  return {
    id: `shot-${shot.shotNumber}-${shot.startFrame}`,
    shotNumber: shot.shotNumber,
    rawStartFrame: shot.rawStartFrame,
    rawEndFrame: shot.rawEndFrame,
    startFrame: shot.startFrame,
    endFrame: shot.endFrame,
    startTimecode: shot.startTimecode,
    endTimecode: shot.endTimecode,
    duration: shot.duration,
    durationFrames: shot.durationFrames,
    firstFrameUrl: getApiUrl(shot.firstFrameUrl),
    middleFrameUrl: getApiUrl(shot.middleFrameUrl),
    lastFrameUrl: getApiUrl(shot.lastFrameUrl),
    keyframeFrames: shot.keyframeFrames || {
      first: shot.startFrame,
      middle: shot.middleFrame ?? Math.floor((shot.startFrame + shot.endFrame) / 2),
      last: shot.endFrame,
    },
    keyframeSource: shot.keyframeSource || 'AI',
    status: shot.status,
    modifiedSource: shot.modifiedSource,
    tags: shot.tags || [],
    notes: shot.notes || `镜头 ${shot.shotNumber} 由 pySceneDetect 自动识别。`,
    confidence: shot.confidence ?? undefined,
  };
}

/**
 * Analyze a video with the local FastAPI/pySceneDetect service.
 */
export async function analyzeVideoShots(
  videoFileOrUrl: File | string,
  onProgress?: DetectionProgressCallback
): Promise<{ metadata: VideoMetadata; shots: Shot[] }> {
  onProgress?.(1, 10, '正在准备视频并读取元数据...');
  const file = await toUploadableFile(videoFileOrUrl);

  const formData = new FormData();
  formData.append('video', file);
  formData.append('detector', 'content');
  formData.append('threshold', '27');

  onProgress?.(2, 25, '正在使用 pySceneDetect 检测镜头边界...');
  const response = await fetch('/api/analyze', {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => null) as
    | (AnalysisApiResponse & { detail?: string })
    | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.detail || `镜头分析失败（HTTP ${response.status}）`);
  }

  onProgress?.(3, 70, '正在读取 pySceneDetect 的镜头结果...');
  const shots = payload.shots.map(mapShot);
  onProgress?.(4, 90, `正在整理 ${shots.length} 个镜头的三帧关键帧...`);
  onProgress?.(5, 100, '分析完成！');

  return {
    metadata: {
      ...payload.metadata,
      url: getApiUrl(payload.metadata.url),
      isSample: false,
    },
    shots,
  };
}

export async function regenerateProjectKeyframes(
  videoFile: File,
  shots: Shot[],
): Promise<Shot[]> {
  const formData = new FormData();
  formData.append('video', videoFile);
  formData.append('shots', JSON.stringify(shots.map((shot) => ({
    shotNumber: shot.shotNumber,
    startFrame: shot.startFrame,
    endFrame: shot.endFrame,
    keyframeFrames: shot.keyframeFrames,
    keyframeSource: shot.keyframeSource,
    status: shot.status,
    modifiedSource: shot.modifiedSource,
    tags: shot.tags,
    notes: shot.notes,
    confidence: shot.confidence,
  }))));
  const response = await fetch('/api/keyframes', { method: 'POST', body: formData });
  const payload = await response.json().catch(() => null) as { shots?: Shot[]; detail?: string } | null;
  if (!response.ok || !payload?.shots) {
    throw new Error(payload?.detail || `关键帧恢复失败（HTTP ${response.status}）`);
  }
  return payload.shots.map((restored, index) => ({
    ...shots[index],
    ...restored,
    id: shots[index]?.id || restored.id,
    status: shots[index]?.status || restored.status,
    modifiedSource: shots[index]?.modifiedSource || restored.modifiedSource,
    tags: shots[index]?.tags || restored.tags,
    notes: shots[index]?.notes || restored.notes,
  }));
}

export async function saveProjectToServer(project: SceneDetectProject): Promise<{ directory: string; fileName: string }> {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  const payload = await response.json().catch(() => null) as { directory?: string; fileName?: string; detail?: string } | null;
  if (!response.ok || !payload?.directory || !payload.fileName) {
    throw new Error(payload?.detail || `项目保存失败（HTTP ${response.status}）`);
  }
  return { directory: payload.directory, fileName: payload.fileName };
}
