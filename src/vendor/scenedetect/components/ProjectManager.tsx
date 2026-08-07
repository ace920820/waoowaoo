import React from 'react';
import { Check, FolderOpen, Plus, Save, Trash2, X } from 'lucide-react';
import { RecentProject, SceneDetectProject } from '../utils/projectStore';
import { readSceneDetectProject } from '../utils/export';

interface ProjectManagerProps {
  isOpen: boolean;
  currentProject: SceneDetectProject | null;
  recentProjects: RecentProject[];
  isDirty: boolean;
  onClose: () => void;
  onNewProject: () => void;
  onOpenProject: (project: SceneDetectProject, videoFile?: File) => Promise<boolean>;
  onSaveProject: (name: string, saveAs: boolean) => void;
  onDeleteRecent: (id: string) => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({
  isOpen,
  currentProject,
  recentProjects,
  isDirty,
  onClose,
  onNewProject,
  onOpenProject,
  onSaveProject,
  onDeleteRecent,
}) => {
  const [projectName, setProjectName] = React.useState(currentProject?.project.name || '');
  const [pendingProject, setPendingProject] = React.useState<SceneDetectProject | null>(null);
  const projectInputRef = React.useRef<HTMLInputElement | null>(null);
  const sourceInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setProjectName(currentProject?.project.name || '');
  }, [currentProject, isOpen]);

  if (!isOpen) return null;

  const chooseSourceForProject = (project: SceneDetectProject) => {
    setPendingProject(project);
    sourceInputRef.current?.click();
  };

  const openProject = async (project: SceneDetectProject) => {
    if (await onOpenProject(project)) {
      onClose();
      return;
    }
    chooseSourceForProject(project);
  };

  const handleProjectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      openProject(await readSceneDetectProject(file));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '项目文件加载失败');
    }
  };

  const handleSourceFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !pendingProject) return;
    onOpenProject(pendingProject, file).then((opened) => {
      if (opened) {
        setPendingProject(null);
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full shadow-2xl text-slate-100">
        <input ref={projectInputRef} type="file" accept="application/json,.json,.scenedetect.json" onChange={handleProjectFile} className="hidden" />
        <input ref={sourceInputRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/m4v,video/avi,video/x-matroska" onChange={handleSourceFile} className="hidden" />

        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-bold">项目管理</h2>
            <p className="text-xs text-slate-400 mt-1">项目文件保存镜头审核进度，优先自动恢复原视频，失效时再选择视频</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800" title="关闭项目管理">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-5">
          <section className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Save className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold">当前项目</h3>
            </div>
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="项目名称"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-400"
            />
            <div className="text-[11px] text-slate-500 mt-2 truncate">
              {currentProject ? `${currentProject.source.fileName} · ${currentProject.shots.length} 个镜头` : '尚未创建项目'}
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={onNewProject} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> 新建
              </button>
              <button onClick={() => onSaveProject(projectName, false)} disabled={!currentProject} className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 text-xs font-semibold flex items-center gap-1.5">
                <Save className="w-3.5 h-3.5" /> 保存
              </button>
              <button onClick={() => onSaveProject(projectName, true)} disabled={!currentProject} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs">另存为</button>
            </div>
            <div className={`text-[11px] mt-3 flex items-center gap-1 ${isDirty ? 'text-amber-300' : 'text-emerald-300'}`}>
              {isDirty ? '● 有未保存修改' : <><Check className="w-3 h-3" /> 已保存</>}
            </div>
          </section>

          <section className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-semibold">打开项目</h3>
            </div>
            <button onClick={() => projectInputRef.current?.click()} className="w-full px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs flex items-center justify-center gap-2">
              <FolderOpen className="w-3.5 h-3.5" /> 打开项目文件
            </button>
            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">保存项目会写入 SceneDetect/projects 专用目录。打开项目时会优先读取原视频，找不到时才要求选择对应文件。</p>
          </section>
        </div>

        <section className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">最近项目</h3>
            <span className="text-[11px] text-slate-500">浏览器本地保存</span>
          </div>
          {recentProjects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 py-7 text-center text-xs text-slate-500">暂无最近项目</div>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-2">
              {recentProjects.map((item) => (
                <div key={item.id} className="flex items-center gap-3 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5">
                  <button onClick={() => openProject(item.project)} className="min-w-0 flex-1 text-left hover:text-cyan-300">
                    <div className="text-xs font-semibold truncate">{item.name}</div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">{item.sourceFileName} · {item.shotCount} 个镜头 · {new Date(item.updatedAt).toLocaleString()}</div>
                  </button>
                  <button onClick={() => onDeleteRecent(item.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-rose-300 hover:bg-rose-950/40" title="删除最近项目记录">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
