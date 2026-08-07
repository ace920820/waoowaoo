import { prisma } from '@/lib/prisma'
import { createRemakeProject } from '@/lib/remake-projects/service'

async function main() {
  const userId = '60f7ebf8-1c84-4448-8149-a07f057c075b'
  const result = await createRemakeProject({
    userId,
    name: '翻拍演示项目（Phase 5 效果）',
    description: '这是用 Phase 5 翻拍工作台创建的演示项目，用于查看项目概览与 SceneDetect 接入状态。',
    creationRequestId: crypto.randomUUID(),
  })
  console.log(JSON.stringify({ created: result.created, id: result.project.id, name: result.project.name, type: result.project.type }))
  await prisma.$disconnect()
}

void main()
