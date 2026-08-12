// Generate vertical 3-frame action sheet for all remake shots that don't have one yet.
//
// Usage: npx tsx scripts/generate-remake-action-sheets.ts <projectId>

import { PrismaClient } from '@prisma/client'
import {
  renderAndUploadActionSheet,
  persistActionSheet,
  ACTION_SHEET_SLOTS,
  type ActionSheetSource,
} from '@/lib/remake-projects/keyframes/action-sheet'
import { getMediaObjectById } from '@/lib/media/service'
import { getObjectBuffer } from '@/lib/storage'

const prisma = new PrismaClient()

async function resolveSourceBuffer(mediaId: string): Promise<Buffer> {
  const media = await getMediaObjectById(mediaId)
  const storageKey = media?.storageKey ?? mediaId
  if (!storageKey) throw new Error(`No storage key for media ${mediaId}`)
  return await getObjectBuffer(storageKey)
}

async function main() {
  const projectId = process.argv[2]
  if (!projectId) {
    console.error('Usage: npx tsx scripts/generate-remake-action-sheets.ts <projectId>')
    process.exit(1)
  }

  console.log(`Processing project: ${projectId}`)

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      type: true,
      remakeProject: {
        select: {
          id: true,
          shots: {
            select: {
              id: true,
              currentRevision: true,
              revisions: {
                where: { lifecycleState: 'active' },
                orderBy: { revision: 'desc' },
                take: 1,
                select: {
                  id: true,
                  revision: true,
                  keyframeMediaRefs: true,
                  keyframeFrames: true,
                  outputs: {
                    where: { kind: 'action_sheet', invalidatedAt: null },
                    select: { id: true, mediaId: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!project?.remakeProject) {
    console.error('Remake project not found')
    process.exit(1)
  }

  const shots = project.remakeProject.shots
  console.log(`Found ${shots.length} shots`)

  let generated = 0
  let skipped = 0
  let failed = 0

  for (const shot of shots) {
    const revision = shot.revisions[0]
    if (!revision) {
      console.log(`  Shot ${shot.id}: no active revision, skip`)
      skipped++
      continue
    }

    const hasActionSheet = revision.outputs.some((o) => !!o.mediaId)
    if (hasActionSheet) {
      console.log(`  Shot ${shot.id}: already has action sheet, skip`)
      skipped++
      continue
    }

    const refs = (revision.keyframeMediaRefs ?? {}) as Record<string, string | null | undefined>
    const frames = (revision.keyframeFrames ?? {}) as Record<string, number | null | undefined>

    const first = refs.first ?? refs.start
    const middle = refs.middle
    const last = refs.last ?? refs.end

    if (!first || !middle || !last) {
      console.log(`  Shot ${shot.id}: missing keyframe media refs, skip`)
      skipped++
      continue
    }

    try {
      console.log(`  Shot ${shot.id}: generating action sheet...`)

      const sources: ActionSheetSource[] = []
      for (const slot of ACTION_SHEET_SLOTS) {
        const mediaId = slot === 'start' ? first! : slot === 'middle' ? middle! : last!
        const timestamp =
          slot === 'start'
            ? (frames.first as number) ?? 0
            : slot === 'middle'
              ? (frames.middle as number) ?? 0
              : (frames.last as number) ?? 0
        const buffer = await resolveSourceBuffer(mediaId)
        sources.push({ slot, mediaId, timestamp, buffer })
      }

      const { key } = await renderAndUploadActionSheet({
        projectId,
        revisionId: revision.id,
        sources,
      })

      await persistActionSheet({
        projectId,
        shotId: shot.id,
        revisionId: revision.id,
        confirmed: true,
        sources: sources.map(({ slot, mediaId, timestamp }) => ({ slot, mediaId, timestamp })),
        mediaId: key,
      })

      console.log(`  Shot ${shot.id}: done`)
      generated++
    } catch (err) {
      console.error(`  Shot ${shot.id}: FAILED:`, err instanceof Error ? err.message : String(err))
      failed++
    }
  }

  console.log(`\nSummary:`)
  console.log(`  Generated: ${generated}`)
  console.log(`  Skipped:   ${skipped}`)
  console.log(`  Failed:    ${failed}`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
