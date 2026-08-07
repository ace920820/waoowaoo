/**
 * Convert frame index to SMPTE / Millisecond timecode string.
 * Example: frame 125, fps 30 => "00:04.167"
 */
export function frameToTimecode(frame: number, fps: number = 30, includeHours = false): string {
  const safeFrame = Math.max(0, Math.floor(frame));
  const totalSeconds = safeFrame / fps;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((totalSeconds % 1) * 1000);

  const pad = (num: number, size = 2) => String(num).padStart(size, '0');
  const msPad = (num: number) => String(num).padStart(3, '0');

  if (includeHours || hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${msPad(milliseconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}.${msPad(milliseconds)}`;
}

/**
 * Convert time in seconds to formatted timecode
 */
export function secondsToTimecode(seconds: number, fps: number = 30): string {
  const frame = Math.floor(seconds * fps);
  return frameToTimecode(frame, fps);
}

/**
 * Convert timecode string back to frame index
 * Format supported: HH:MM:SS.mmm or MM:SS.mmm or SS.mmm
 */
export function timecodeToFrame(timecode: string, fps: number = 30): number {
  if (!timecode) return 0;
  const parts = timecode.split(':');
  let seconds = 0;

  if (parts.length === 3) {
    seconds = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    seconds = parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
  } else {
    seconds = parseFloat(parts[0]);
  }

  return Math.max(0, Math.round(seconds * fps));
}

/**
 * Format duration in human readable string
 */
export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0.000 秒';
  return `${seconds.toFixed(3)} 秒`;
}

/**
 * Format file size in KB / MB
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
