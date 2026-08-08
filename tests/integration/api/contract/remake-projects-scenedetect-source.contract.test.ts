import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const routePath = 'src/app/api/remake-projects/[projectId]/source/route.ts'
const importRoutePath = 'src/app/api/remake-projects/[projectId]/scenedetect/import/route.ts'

describe('SceneDetect source route contract', () => {
  it('keeps the authenticated multipart upload boundary in the App Router', () => {
    expect(existsSync(routePath)).toBe(true)
    const source = readFileSync(routePath, 'utf8')
    expect(source).toContain('export const POST')
    expect(source).toContain('requireProjectAuthLight')
    expect(source).toContain('request.formData()')
  })

  it('maps stale SceneDetect source results to a conflict response', () => {
    const source = readFileSync(importRoutePath, 'utf8')
    expect(source).toContain("new ApiError('CONFLICT'")
    expect(source).toContain('SCENEDETECT_SOURCE_REVISION_STALE')
  })
})
