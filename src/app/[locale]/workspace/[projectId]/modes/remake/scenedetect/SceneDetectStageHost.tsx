'use client'

import { useEffect, useRef, useState } from 'react'
import type { SceneDetectProject } from '@/vendor/scenedetect'
import type { SceneDetectIntegrationRuntime } from '@/lib/remake-projects/scenedetect/integration-runtime'
import { SceneDetectEmbeddedApp as CanonicalSceneDetectEmbeddedApp } from '@/vendor/scenedetect'
import './scenedetect-stage.css'

export type SceneDetectStageAvailability = 'unavailable' | 'phase-6' | 'ready'

export type SceneDetectStageHostProps = {
  projectId: string
  initialProject: SceneDetectProject | null
  runtime: SceneDetectIntegrationRuntime | null
  enabled?: boolean
  availability?: SceneDetectStageAvailability
}

export function SceneDetectStageHost({
  projectId,
  initialProject,
  runtime,
  enabled = false,
  availability = 'phase-6',
}: SceneDetectStageHostProps) {
  const [project, setProject] = useState<SceneDetectProject | null>(initialProject)
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready'>('idle')
  const hostRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!runtime || !enabled) return
    let active = true
    setLoadState('loading')
    void runtime
      .loadProject(projectId)
      .then((loaded) => {
        if (!active) return
        setProject(loaded)
        setLoadState('ready')
      })
      .catch(() => {
        // 加载失败：保留 initialProject（可能为 null），仍允许 App 挂载以便排查
        if (!active) return
        setLoadState('ready')
      })
    return () => {
      active = false
    }
  }, [enabled, projectId, runtime])

  const canMount = enabled && Boolean(runtime)
  // 等待服务端项目加载完成再挂载 canonical App：App 的 useState 只在首次渲染读取
  // initialProject，若以 null 挂载，vendored createProject() 会用 crypto.randomUUID()
  // 生成随机项目 ID，导致后续 analyze 请求打到不存在的 projectId（404）。
  const mountReady = canMount && loadState === 'ready'

  return (
    <section
      ref={hostRef}
      className="scenedetect-stage-root"
      data-project-id={projectId}
      data-stage-enabled={canMount ? 'true' : 'false'}
      data-stage-availability={availability}
      aria-label="SceneDetect stage"
    >
      {canMount ? (
        mountReady ? (
          <div className="scenedetect-stage-app" data-testid="scenedetect-embedded-app">
            <CanonicalSceneDetectEmbeddedApp
              key={projectId}
              embedded
              initialProject={project}
              runtime={runtime}
            />
          </div>
        ) : (
          <div className="scenedetect-stage-loading" data-testid="scenedetect-stage-loading">
            <span>正在加载项目…</span>
          </div>
        )
      ) : (
        <div className="scenedetect-stage-disabled" data-testid="scenedetect-stage-disabled">
          <strong>SceneDetect</strong>
          <span>{availability === 'unavailable' ? 'Integration unavailable' : 'Available in Phase 6'}</span>
        </div>
      )}
    </section>
  )
}

export default SceneDetectStageHost
