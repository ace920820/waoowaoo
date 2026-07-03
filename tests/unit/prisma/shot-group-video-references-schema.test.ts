import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('NovelPromotionShotGroup schema', () => {
  it('stores videoReferencesJson as LongText for rich storyboard prompt snapshots', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    const shotGroupModel = schema.match(/model NovelPromotionShotGroup \{[\s\S]*?\n\}/)?.[0] ?? ''

    expect(shotGroupModel).toContain('videoReferencesJson String?')
    expect(shotGroupModel).toContain('videoReferencesJson String?                    @db.LongText')
  })
})
