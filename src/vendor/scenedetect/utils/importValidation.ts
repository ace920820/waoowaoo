import { SceneDetectProject } from './projectStore';

export type ImportValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Embedded-mode import validation for a parsed `.scenedetect.json` project
 * (Phase: 镜头分析页导出/加载). Pure — no DOM/network — so it is unit-testable.
 *
 * Rules:
 *  - shots must be non-empty;
 *  - shot numbers must be strictly ascending (1-based, no duplicates);
 *  - frame ranges must be legal: 0 <= start < end;
 *  - when the current source frame count is known, every range must fit
 *    (start/end <= totalFrames) — importing boundaries beyond the current
 *    video would produce invalid media extraction requests.
 */
export function validateImportedSceneDetectProject(
  project: SceneDetectProject,
  options: { totalFrames?: number } = {},
): ImportValidationResult {
  const shots = project.shots;
  if (!Array.isArray(shots) || shots.length === 0) {
    return { ok: false, reason: '导入文件不包含任何镜头切分点' };
  }

  let previousShotNumber = 0;
  for (let index = 0; index < shots.length; index += 1) {
    const shot = shots[index];
    const shotNumber = shot?.shotNumber;
    const start = shot?.startFrame;
    const end = shot?.endFrame;
    if (typeof shotNumber !== 'number' || typeof start !== 'number' || typeof end !== 'number') {
      return { ok: false, reason: `第 ${index + 1} 个镜头缺少帧号或边界数据，无法导入` };
    }
    if (shotNumber <= previousShotNumber) {
      return { ok: false, reason: `镜头编号未按升序排列（第 ${index + 1} 个镜头为 #${shotNumber}）` };
    }
    previousShotNumber = shotNumber;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      return { ok: false, reason: `镜头 #${shotNumber} 的边界非法（start=${start}, end=${end}）` };
    }
    const totalFrames = options.totalFrames;
    if (typeof totalFrames === 'number' && totalFrames > 0 && end > totalFrames) {
      return {
        ok: false,
        reason: `镜头 #${shotNumber} 结束帧 ${end} 超出当前视频范围（${totalFrames} 帧），无法导入`,
      };
    }
  }
  return { ok: true };
}
