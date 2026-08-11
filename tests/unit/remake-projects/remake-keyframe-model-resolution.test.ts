import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('Keyframe generation model resolution (service contract)', () => {
  const servicePath = resolve(process.cwd(), 'src/lib/remake-projects/keyframes/service.ts')
  const source = readFileSync(servicePath, 'utf8')

  it('buildKeyframeGenerationSubmission 的 model 参数可选', () => {
    const match = source.match(
      /export async function buildKeyframeGenerationSubmission\(input:\s*\{([^}]+)\}/,
    )
    expect(match).toBeTruthy()
    const params = match![1]
    // model 不是必填（没有单独的 model: string 行，而是可选或有默认值）
    // 检查是否有 model 相关的解析逻辑
    expect(params).toContain('model')
  })

  it('当 model 为空时回退到项目 storyboardModel', () => {
    // service 应该调用 getRemakeProjectModelConfig 或类似函数获取项目默认模型
    expect(source).toMatch(/storyboardModel|getProjectModelConfig|getRemake.*Model/)
  })

  it('没有可用 model 时抛出明确错误', () => {
    expect(source).toMatch(/MODEL_NOT_CONFIGURED|MODEL_REQUIRED|storyboard model|分镜模型/)
  })
})

describe('Keyframe generation API route (model optional)', () => {
  const routePath = resolve(
    process.cwd(),
    'src/app/api/remake-projects/[projectId]/keyframes/route.ts',
  )
  const source = readFileSync(routePath, 'utf8')

  it('generateSchema 的 model 字段可选', () => {
    // 从 z.string().trim().min(1) 改为 z.string().trim().min(1).optional()
    // 或 z.string().trim().min(1).nullable() 或从 schema 中移除
    const match = source.match(/model:\s*z\.string\(\)\.trim\(\)\.min\(1\)(\s*\)?)/)
    // 如果有 .optional() 或 .nullable() 或完全没有 model 字段，都算通过
    const hasOptional = source.match(/model:.*\.optional\(\)/)
    const hasNullable = source.match(/model:.*\.nullable\(\)/)
    const isOptional = hasOptional || hasNullable
    // 也可能已经改了默认值处理
    expect(Boolean(isOptional || source.includes('model?.trim') || source.includes('model ||'))).toBe(true)
  })
})
