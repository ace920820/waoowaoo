import { AnalysisStatus, Shot, VideoMetadata } from '../types';

export interface SceneDetectProject {
  schemaVersion: 2;
  type: 'scenedetect-project';
  project: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
  };
  source: {
    fileName: string;
    size: number;
    duration: number;
    fps: number;
    width: number;
    height: number;
    totalFrames: number;
    videoUrl?: string;
  };
  analysis: {
    detector: 'pySceneDetect';
    detectorType: 'content';
    threshold: number;
    analyzedAt: string;
    status: AnalysisStatus;
  };
  view: {
    currentFrame: number;
    activeShotId: string | null;
  };
  shots: Shot[];
}

export interface RecentProject {
  id: string;
  name: string;
  sourceFileName: string;
  updatedAt: string;
  shotCount: number;
  status: AnalysisStatus;
  project: SceneDetectProject;
}

const DB_NAME = 'scenedetect-projects';
const DB_VERSION = 1;
const PROJECT_STORE = 'projects';
const DRAFT_STORE = 'drafts';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('当前浏览器不支持本地项目存储'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        database.createObjectStore(DRAFT_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开本地项目存储'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('本地项目存储操作失败'));
  });
}

export async function saveRecentProject(project: SceneDetectProject): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(PROJECT_STORE, 'readwrite');
  const store = transaction.objectStore(PROJECT_STORE);
  const existing = await requestToPromise<RecentProject[]>(store.getAll());
  for (const item of existing) {
    if (item.id !== project.project.id && item.name === project.project.name && item.sourceFileName === project.source.fileName) {
      store.delete(item.id);
    }
  }
  await requestToPromise(store.put({
    id: project.project.id,
    name: project.project.name,
    sourceFileName: project.source.fileName,
    updatedAt: project.project.updatedAt,
    shotCount: project.shots.length,
    status: project.analysis.status,
    project,
  } satisfies RecentProject));
  database.close();
}

export async function listRecentProjects(): Promise<RecentProject[]> {
  const database = await openDatabase();
  const projects = await requestToPromise<RecentProject[]>(database.transaction(PROJECT_STORE, 'readonly').objectStore(PROJECT_STORE).getAll());
  database.close();
  const unique = new Map<string, RecentProject>();
  for (const project of projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const key = `${project.name}::${project.sourceFileName}`;
    if (!unique.has(key)) unique.set(key, project);
  }
  return [...unique.values()];
}

export async function deleteRecentProject(id: string): Promise<void> {
  const database = await openDatabase();
  await requestToPromise(database.transaction(PROJECT_STORE, 'readwrite').objectStore(PROJECT_STORE).delete(id));
  database.close();
}

export async function saveDraft(project: SceneDetectProject): Promise<void> {
  const database = await openDatabase();
  await requestToPromise(database.transaction(DRAFT_STORE, 'readwrite').objectStore(DRAFT_STORE).put({ id: 'current', project }));
  database.close();
}

export async function loadDraft(): Promise<SceneDetectProject | null> {
  const database = await openDatabase();
  const record = await requestToPromise<{ id: string; project: SceneDetectProject } | undefined>(database.transaction(DRAFT_STORE, 'readonly').objectStore(DRAFT_STORE).get('current'));
  database.close();
  return record?.project || null;
}

export function createProject(
  name: string,
  metadata: VideoMetadata,
  shots: Shot[],
  status: AnalysisStatus,
  currentFrame: number,
  activeShotId: string | null,
  existing?: SceneDetectProject,
): SceneDetectProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    type: 'scenedetect-project',
    project: {
      id: existing?.project.id || crypto.randomUUID(),
      name: name || metadata.name.replace(/\.[^/.]+$/, '') || '未命名项目',
      createdAt: existing?.project.createdAt || now,
      updatedAt: now,
    },
    source: {
      fileName: metadata.name,
      size: metadata.size,
      duration: metadata.duration,
      fps: metadata.fps,
      width: metadata.width,
      height: metadata.height,
      totalFrames: metadata.totalFrames,
      videoUrl: metadata.url.startsWith('blob:') || metadata.url.startsWith('data:')
        ? existing?.source.videoUrl
        : metadata.url,
    },
    analysis: {
      detector: 'pySceneDetect',
      detectorType: 'content',
      threshold: 27,
      analyzedAt: existing?.analysis.analyzedAt || now,
      status,
    },
    view: { currentFrame, activeShotId },
    shots,
  };
}

export function projectToMetadata(project: SceneDetectProject, videoUrl: string): VideoMetadata {
  return {
    name: project.source.fileName,
    size: project.source.size,
    duration: project.source.duration,
    fps: project.source.fps,
    width: project.source.width,
    height: project.source.height,
    totalFrames: project.source.totalFrames,
    url: videoUrl,
    isSample: false,
  };
}
