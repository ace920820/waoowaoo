'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { AppIcon } from '@/components/ui/icons'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRemakeProject } from '@/lib/query/hooks/useRemakeProject'
import { SceneDetectStageHost } from './scenedetect/SceneDetectStageHost'
import { PromptStage } from './prompt/PromptStage'
import RemakeStoryboardStage from './storyboard/RemakeStoryboardStage'
import RemakeVideoStage from './video/RemakeVideoStage'
import { createSceneDetectRuntime } from '@/lib/remake-projects/scenedetect/runtime-client'
import './scenedetect/scenedetect-stage.css'

export const REMAKE_WORKBENCH_STAGES = ['overview', 'scenedetect', 'prompt', 'storyboard', 'video'] as const
const STAGES = REMAKE_WORKBENCH_STAGES
type RemakeStage = typeof REMAKE_WORKBENCH_STAGES[number]
export function isRemakeWorkbenchStage(value: string | null): value is RemakeStage {
  return value !== null && (REMAKE_WORKBENCH_STAGES as readonly string[]).includes(value)
}

export type RemakeWorkbenchProps = {
  projectId: string
  onStageChange?: (stage: RemakeStage) => void
}

export default function RemakeWorkbench({ projectId, onStageChange }: RemakeWorkbenchProps) {
  const t = useTranslations('remakeWorkbench')
  const searchParams = useSearchParams()
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false)
  // 在 prompt / 分镜 / 视频等阶段之间共享选中的镜头
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const requestedStage = searchParams?.get('stage') as RemakeStage | null
  const stage = isRemakeWorkbenchStage(requestedStage) ? requestedStage : 'overview'
  const query = useRemakeProject(projectId)
  const snapshot = query.data
  const runtime = useMemo(() => createSceneDetectRuntime(projectId), [projectId])
  const latestTasks = useMemo(() => snapshot?.tasks.slice(0, 8) ?? [], [snapshot?.tasks])
  const updateStage = (nextStage: RemakeStage) => onStageChange?.(nextStage)
  const sourceMetadata = snapshot?.source.metadata as Record<string, unknown> | null | undefined
  const sourceName = typeof sourceMetadata?.fileName === 'string' ? sourceMetadata.fileName : t('sourceStatus.not_imported')
  const resolution = sourceMetadata?.width && sourceMetadata?.height ? `${sourceMetadata.width}x${sourceMetadata.height}` : '-'
  const fps = typeof sourceMetadata?.fps === 'number' ? `${sourceMetadata.fps}fps` : ''

  if (query.isLoading) return <div className="remake-workbench-loading">{t('loading')}</div>
  if (query.isError || !snapshot) return <div className="remake-workbench-error">{query.error?.message || t('loadFailed')}</div>

  return (
    <div className="remake-workbench" data-testid="remake-workbench">
      <header className="remake-project-bar">
        <div>
          <p className="remake-eyebrow">{t('eyebrow')}</p>
          <h1>{snapshot.project.name}</h1>
          {snapshot.project.description ? <p>{snapshot.project.description}</p> : null}
        </div>
        <button type="button" className="remake-task-button" onClick={() => setTaskDrawerOpen(true)}>
          {t('tasks')} <span aria-label={t('taskCount')}>{snapshot.tasks.length}</span>
        </button>
      </header>

      <nav className="remake-stage-nav" aria-label={t('stageNavigation')}>
        {STAGES.map((item) => (
          <button key={item} type="button" className={stage === item ? 'is-active' : ''} onClick={() => updateStage(item)}>
            {t(`stages.${item}`)}
          </button>
        ))}
      </nav>

      <main className={stage === 'overview' ? 'remake-overview' : 'remake-overview is-context-hidden'} data-testid="remake-overview" aria-hidden={stage !== 'overview'}>
        <section className="remake-overview-hero"><div><p className="remake-overview-pill"><AppIcon name="film" size={14} /> 项目概览与翻拍设置</p><h2>{snapshot.project.name}</h2><p>查看原视频基础信息、转码参数与翻拍总体进度。</p></div><div className="remake-overview-actions"><button type="button" onClick={() => updateStage('scenedetect')}>{t('stages.scenedetect')}</button><button type="button" onClick={() => updateStage('prompt')}>进入 Prompt 阶段 <AppIcon name="arrowRight" size={16} /></button></div></section>
        <section className="remake-overview-cards" aria-label={t('summary')}>
          <OverviewMetric icon={<AppIcon name="film" />} label="原视频文件" value={sourceName}/><OverviewMetric icon={<AppIcon name="monitorCog" />} label="分辨率与帧率" value={`${resolution} ${fps}`}/><OverviewMetric icon={<AppIcon name="clapperboard" />} label="目标动漫风格" value="待在 Prompt 阶段定义"/><OverviewMetric icon={<AppIcon name="layers" />} label="总镜头数" value={`${snapshot.shots.length} 镜头`}/>
        </section>
        <section className="remake-workflow"><h2><AppIcon name="sparkles" size={18} /> 翻拍工作流进度</h2><div><WorkflowStep title="1. 项目初始化" text={snapshot.source.mediaId ? '原视频已导入，元数据可恢复。' : '等待原视频导入。'} state={snapshot.source.mediaId ? '已就绪' : '待导入'}/><WorkflowStep title="2. 镜头分析与关键帧切分" text={`已识别 ${snapshot.shots.length} 个当前镜头。`} state={snapshot.shots.length ? '已完成' : '待分析'} onClick={() => updateStage('scenedetect')}/><WorkflowStep title="3. Prompt 结构化分析" text="关键帧和整段视频 Prompt 由后台任务分析与审核。" state="当前阶段" active onClick={() => updateStage('prompt')}/></div></section>
      </main>
      <main className="remake-stage-main" data-stage-active={stage === 'scenedetect' ? 'true' : 'false'}>
        <SceneDetectStageHost projectId={projectId} initialProject={null} runtime={runtime} enabled availability="ready" />
      </main>
      {stage === 'prompt' ? <PromptStage projectId={projectId} snapshot={snapshot} selectedShotId={selectedShotId} onSelectedShotChange={setSelectedShotId} onEnterStoryboard={() => updateStage('storyboard')} /> : null}
      {stage === 'storyboard' ? <RemakeStoryboardStage projectId={projectId} snapshot={snapshot} selectedShotId={selectedShotId} onSelectedShotChange={setSelectedShotId} onNavigateToPrompt={() => updateStage('prompt')} /> : null}
      {stage === 'video' ? <RemakeVideoStage projectId={projectId} snapshot={snapshot} selectedShotId={selectedShotId} onSelectedShotChange={setSelectedShotId} /> : null}

      {taskDrawerOpen ? <div className="remake-task-overlay" role="presentation" onMouseDown={() => setTaskDrawerOpen(false)}>
        <aside className="remake-task-drawer" role="dialog" aria-modal="true" aria-label={t('tasks')} onMouseDown={(event) => event.stopPropagation()}>
          <div className="remake-section-heading"><h2>{t('tasks')}</h2><button type="button" onClick={() => setTaskDrawerOpen(false)} aria-label={t('close')}>×</button></div>
          {latestTasks.length === 0 ? <p className="remake-empty">{t('noTasks')}</p> : <ul>{latestTasks.map((task) => <li key={task.id}><span>{task.type}</span><em>{task.status}</em></li>)}</ul>}
        </aside>
      </div> : null}
    </div>
  )
}

function OverviewMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="remake-overview-metric"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div> }
function WorkflowStep({ title, text, state, active, onClick }: { title: string; text: string; state: string; active?: boolean; onClick?: () => void }) { return <button type="button" className={active ? 'is-active' : ''} onClick={onClick}><header><strong>{title}</strong><em>{state}</em></header><span>{text}</span></button> }
