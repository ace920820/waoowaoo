'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useRemakeProject } from '@/lib/query/hooks/useRemakeProject'
import { SceneDetectStageHost } from './scenedetect/SceneDetectStageHost'

const STAGES = ['overview', 'scenedetect'] as const
type RemakeStage = typeof STAGES[number]

export type RemakeWorkbenchProps = {
  projectId: string
  onStageChange?: (stage: RemakeStage) => void
}

export default function RemakeWorkbench({ projectId, onStageChange }: RemakeWorkbenchProps) {
  const t = useTranslations('remakeWorkbench')
  const searchParams = useSearchParams()
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false)
  const requestedStage = searchParams?.get('stage') as RemakeStage | null
  const stage = requestedStage && STAGES.includes(requestedStage) ? requestedStage : 'overview'
  const query = useRemakeProject(projectId)
  const snapshot = query.data
  const latestTasks = useMemo(() => snapshot?.tasks.slice(0, 8) ?? [], [snapshot?.tasks])
  const updateStage = (nextStage: RemakeStage) => onStageChange?.(nextStage)

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

      {stage === 'overview' ? (
        <main className="remake-overview" data-testid="remake-overview">
          <section className="remake-summary-grid" aria-label={t('summary')}>
            <div className="remake-summary-item"><span>{t('source')}</span><strong>{t(`sourceStatus.${snapshot.source.status}` as 'sourceStatus.not_imported')}</strong></div>
            <div className="remake-summary-item"><span>{t('shots')}</span><strong>{snapshot.shots.length}</strong></div>
            <div className="remake-summary-item"><span>{t('review')}</span><strong>{snapshot.shots.filter((shot) => shot.needsReview).length}</strong></div>
          </section>
          <section className="remake-shot-panel">
            <div className="remake-section-heading"><h2>{t('shotList')}</h2><span>{snapshot.shots.length}</span></div>
            {snapshot.shots.length === 0 ? <p className="remake-empty">{t('noShots')}</p> : (
              <ul>{snapshot.shots.map((shot) => <li key={shot.id}><span>#{shot.sequence ?? '-'}</span><code>{shot.stableKey}</code><em>{shot.needsReview ? t('needsReview') : shot.reviewStatus}</em></li>)}</ul>
            )}
          </section>
        </main>
      ) : (
        <main className="remake-stage-main">
          <SceneDetectStageHost projectId={projectId} initialProject={null} runtime={null} enabled={false} availability="phase-6" />
        </main>
      )}

      {taskDrawerOpen ? <div className="remake-task-overlay" role="presentation" onMouseDown={() => setTaskDrawerOpen(false)}>
        <aside className="remake-task-drawer" role="dialog" aria-modal="true" aria-label={t('tasks')} onMouseDown={(event) => event.stopPropagation()}>
          <div className="remake-section-heading"><h2>{t('tasks')}</h2><button type="button" onClick={() => setTaskDrawerOpen(false)} aria-label={t('close')}>×</button></div>
          {latestTasks.length === 0 ? <p className="remake-empty">{t('noTasks')}</p> : <ul>{latestTasks.map((task) => <li key={task.id}><span>{task.type}</span><em>{task.status}</em></li>)}</ul>}
        </aside>
      </div> : null}
    </div>
  )
}
