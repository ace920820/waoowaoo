import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { markTaskCompleted } from '@/lib/task/service'
import type { TaskJobData } from '@/lib/task/types'

/**
 * remake_project_initialize：翻拍项目创建时由 createRemakeProject 写入的占位任务。
 * 项目创建事务本身已完成全部初始化（remakeProject.importStatus='not_imported'），
 * 这里只把任务标记为 completed，让 Task 摘要保持真实且不残留 queued 悬挂任务。
 */
export async function handleRemakeProjectInitializeTask(job: Job<TaskJobData>) {
  const { taskId, projectId, userId } = job.data

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true, type: true },
  })
  if (!project || project.userId !== userId || project.type !== 'remake') {
    throw new Error(`invalid remake initialize target: ${projectId}`)
  }

  await markTaskCompleted(taskId, { initialized: true, importStatus: 'not_imported' })
  return { initialized: true }
}
