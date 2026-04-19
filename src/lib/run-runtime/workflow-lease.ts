import { logError as _ulogError, logInfo as _ulogInfo } from '@/lib/logging/core'
import { TaskTerminatedError } from '@/lib/task/errors'
import { RUN_STATUS } from './types'
import { claimRunLease, getRunById, releaseRunLease, renewRunLease } from './service'

// Multi-step LLM runs can spend 40s+ inside a single provider call.
// A 30s lease is too aggressive if the event loop is busy and a renewal timer
// fires late, which can cause the active worker to lose ownership mid-run.
const DEFAULT_RUN_LEASE_MS = 5 * 60_000

export function getDefaultRunLeaseMs() {
  return DEFAULT_RUN_LEASE_MS
}

export async function assertWorkflowRunActive(params: {
  runId: string
  workerId: string
  stage: string
}) {
  const run = await getRunById(params.runId)
  if (!run) {
    _ulogError('[WorkflowLease] run missing during active assertion', params)
    throw new TaskTerminatedError(params.runId, `Run terminated during ${params.stage}: run not found`)
  }
  if (run.leaseOwner !== params.workerId) {
    _ulogError('[WorkflowLease] lease lost during active assertion', {
      ...params,
      currentLeaseOwner: run.leaseOwner,
      leaseExpiresAt: run.leaseExpiresAt,
      status: run.status,
    })
    throw new TaskTerminatedError(params.runId, `Run terminated during ${params.stage}: lease lost`)
  }
  if (
    run.status === RUN_STATUS.CANCELING
    || run.status === RUN_STATUS.CANCELED
    || run.status === RUN_STATUS.COMPLETED
    || run.status === RUN_STATUS.FAILED
  ) {
    _ulogError('[WorkflowLease] run became terminal during active assertion', {
      ...params,
      status: run.status,
      cancelRequestedAt: run.cancelRequestedAt,
    })
    throw new TaskTerminatedError(params.runId, `Run terminated during ${params.stage}`)
  }
}

export async function withWorkflowRunLease<T>(params: {
  runId: string
  userId: string
  workerId: string
  leaseMs?: number
  run: () => Promise<T>
}): Promise<{ claimed: boolean; result: T | null }> {
  const leaseMs = params.leaseMs ?? DEFAULT_RUN_LEASE_MS
  const claimed = await claimRunLease({
    runId: params.runId,
    userId: params.userId,
    workerId: params.workerId,
    leaseMs,
  })
  if (!claimed) {
    _ulogError('[WorkflowLease] failed to claim run lease', {
      runId: params.runId,
      userId: params.userId,
      workerId: params.workerId,
      leaseMs,
    })
    return { claimed: false, result: null }
  }
  _ulogInfo('[WorkflowLease] claimed run lease', {
    runId: params.runId,
    userId: params.userId,
    workerId: params.workerId,
    leaseMs,
    leaseExpiresAt: claimed.leaseExpiresAt,
  })

  const heartbeatTimer = setInterval(() => {
    void renewRunLease({
      runId: params.runId,
      userId: params.userId,
      workerId: params.workerId,
      leaseMs,
    }).then((renewed) => {
      _ulogInfo('[WorkflowLease] renewed run lease', {
        runId: params.runId,
        workerId: params.workerId,
        leaseExpiresAt: renewed?.leaseExpiresAt || null,
      })
    }).catch((error) => {
      _ulogError('[WorkflowLease] renew run lease failed', {
        runId: params.runId,
        workerId: params.workerId,
        message: error instanceof Error ? error.message : String(error),
      })
    })
  }, Math.max(15_000, Math.floor(leaseMs / 3)))

  try {
    return {
      claimed: true,
      result: await params.run(),
    }
  } finally {
    clearInterval(heartbeatTimer)
    await releaseRunLease({
      runId: params.runId,
      workerId: params.workerId,
    })
    _ulogInfo('[WorkflowLease] released run lease', {
      runId: params.runId,
      workerId: params.workerId,
    })
  }
}
