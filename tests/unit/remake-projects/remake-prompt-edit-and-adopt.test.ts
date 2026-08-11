import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('saveAndAdoptPromptHumanEdit (service contract)', () => {
  const servicePath = resolve(process.cwd(), 'src/lib/remake-projects/prompt/service.ts')
  const source = readFileSync(servicePath, 'utf8')

  it('导出 saveAndAdoptPromptHumanEdit 函数', () => {
    expect(source).toContain('export async function saveAndAdoptPromptHumanEdit')
  })

  it('在单个事务中完成版本创建 + 批准 + 采用', () => {
    const match = source.match(
      /export async function saveAndAdoptPromptHumanEdit[\s\S]*?return \(prisma as Client\)\.\$transaction/,
    )
    expect(match).toBeTruthy()
    const fnBody = match![0]
    // 调用 appendPromptVersion 并传 tx
    expect(fnBody).toMatch(/appendPromptVersion\(\{[\s\S]*?tx,/)
    // 调用 approveAndAdoptPromptVersion 并传 tx
    expect(fnBody).toMatch(/approveAndAdoptPromptVersion\(\{[\s\S]*?tx,/)
  })

  it('接受 projectId, userId, trackId, coreText 等参数', () => {
    const match = source.match(
      /export async function saveAndAdoptPromptHumanEdit\(input:\s*\{([^}]+)\}/,
    )
    expect(match).toBeTruthy()
    const params = match![1]
    expect(params).toContain('projectId')
    expect(params).toContain('userId')
    expect(params).toContain('trackId')
    expect(params).toContain('coreText')
  })

  it('返回 version 和 isAdopted', () => {
    const match = source.match(
      /export async function saveAndAdoptPromptHumanEdit[\s\S]*?return \{[\s\S]*?isAdopted/,
    )
    expect(match).toBeTruthy()
  })
})

describe('prompt track API route (human-edit-and-adopt action)', () => {
  const routePath = resolve(
    process.cwd(),
    'src/app/api/remake-projects/[projectId]/prompts/tracks/[trackId]/route.ts',
  )
  const source = readFileSync(routePath, 'utf8')

  it('支持 human_edit_and_adopt action', () => {
    expect(source).toContain('human_edit_and_adopt')
  })

  it('调用 saveAndAdoptPromptHumanEdit', () => {
    expect(source).toContain('saveAndAdoptPromptHumanEdit')
  })

  it('返回新版本和 isAdopted 状态', () => {
    expect(source).toContain('version')
    expect(source).toContain('isAdopted')
  })
})
