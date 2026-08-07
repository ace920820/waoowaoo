'use client'

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
  const canMount = enabled && Boolean(initialProject) && Boolean(runtime)

  return (
    <section
      className="scenedetect-stage-root"
      data-project-id={projectId}
      data-stage-enabled={canMount ? 'true' : 'false'}
      data-stage-availability={availability}
      aria-label="SceneDetect stage"
    >
      {canMount ? (
        <div className="scenedetect-stage-app" data-testid="scenedetect-embedded-app">
          <CanonicalSceneDetectEmbeddedApp />
        </div>
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
