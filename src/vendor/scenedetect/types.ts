export type ShotStatus = 'keep' | 'pending' | 'discard';

export type AnalysisStatus = 
  | 'idle' 
  | 'uploaded_pending' 
  | 'analyzing' 
  | 'analyzed_review' 
  | 'adjusted' 
  | 'exported';

export type AnalysisPhaseId = 1 | 2 | 3 | 4 | 5;

export interface AnalysisPhase {
  id: AnalysisPhaseId;
  name: string;
  description: string;
  progress: number; // 0 to 100
  status: 'waiting' | 'in_progress' | 'completed';
}

export interface Shot {
  id: string;
  shotNumber: number;
  rawStartFrame: number;
  rawEndFrame: number;
  startFrame: number;
  endFrame: number;
  startTimecode: string;
  endTimecode: string;
  duration: number; // in seconds
  durationFrames: number;
  firstFrameUrl: string;
  middleFrameUrl: string;
  lastFrameUrl: string;
  keyframeFrames?: {
    first: number;
    middle: number;
    last: number;
  };
  keyframeSource?: 'AI' | 'USER';
  status: ShotStatus;
  modifiedSource: 'AI' | 'USER';
  tags: string[];
  notes: string;
  confidence?: number; // e.g. 0.92
}

export interface VideoMetadata {
  name: string;
  size: number; // in bytes
  duration: number; // in seconds
  fps: number;
  width: number;
  height: number;
  url: string;
  totalFrames: number;
  isSample?: boolean;
}

export interface HistoryState {
  shots: Shot[];
  description: string;
}
