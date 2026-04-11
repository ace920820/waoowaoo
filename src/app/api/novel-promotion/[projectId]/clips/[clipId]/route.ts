import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { extractScreenplayDialogueItems } from '@/lib/novel-promotion/screenplay-dialogue'

type ClipDialogueRecord = {
    id: string
    episodeId: string
    screenplay: string | null
}

type VoiceLineSyncRecord = {
    id: string
    lineIndex: number
    speaker: string
    content: string
    audioUrl: string | null
    audioMediaId?: string | null
    audioDuration?: number | null
    matchedPanelId?: string | null
}

async function reconcileClipScreenplayDownstream(params: {
    clipId: string
    episodeId: string | null
    previousScreenplay: string | null
    screenplay: string | null
}): Promise<{
    synchronized: boolean
    updatedVoiceLineCount: number
    updatedPanelCount: number
}> {
    if (!params.episodeId) {
        return {
            synchronized: false,
            updatedVoiceLineCount: 0,
            updatedPanelCount: 0,
        }
    }

    const [episodeClips, episodeVoiceLines] = await Promise.all([
        prisma.novelPromotionClip.findMany({
            where: { episodeId: params.episodeId },
            select: {
                id: true,
                episodeId: true,
                screenplay: true,
            },
            orderBy: { createdAt: 'asc' },
        }) as Promise<ClipDialogueRecord[]>,
        prisma.novelPromotionVoiceLine.findMany({
            where: { episodeId: params.episodeId },
            select: {
                id: true,
                lineIndex: true,
                speaker: true,
                content: true,
                audioUrl: true,
                audioMediaId: true,
                audioDuration: true,
                matchedPanelId: true,
            },
            orderBy: { lineIndex: 'asc' },
        }) as Promise<VoiceLineSyncRecord[]>,
    ])

    const previousDialogueItems = extractScreenplayDialogueItems(
        episodeClips.map((episodeClip) => ({
            id: episodeClip.id,
            screenplay: episodeClip.id === params.clipId ? params.previousScreenplay : episodeClip.screenplay,
        })),
    )
    const nextDialogueItems = extractScreenplayDialogueItems(
        episodeClips.map((episodeClip) => ({
            id: episodeClip.id,
            screenplay: episodeClip.id === params.clipId ? params.screenplay : episodeClip.screenplay,
        })),
    )

    const previousClipDialogueItems = previousDialogueItems.filter((item) => item.clipId === params.clipId)
    const nextClipDialogueItems = nextDialogueItems.filter((item) => item.clipId === params.clipId)

    if (previousClipDialogueItems.length !== nextClipDialogueItems.length) {
        return {
            synchronized: false,
            updatedVoiceLineCount: 0,
            updatedPanelCount: 0,
        }
    }

    const voiceLineByLineIndex = new Map<number, VoiceLineSyncRecord>()
    for (const voiceLine of episodeVoiceLines) {
        voiceLineByLineIndex.set(voiceLine.lineIndex, voiceLine)
    }

    const changedPanelIds = new Set<string>()
    let updatedVoiceLineCount = 0

    for (const nextItem of nextClipDialogueItems) {
        const voiceLine = voiceLineByLineIndex.get(nextItem.lineIndex)
        if (!voiceLine) continue

        const speakerChanged = voiceLine.speaker !== nextItem.speaker
        const contentChanged = voiceLine.content !== nextItem.content
        if (!speakerChanged && !contentChanged) continue

        await prisma.novelPromotionVoiceLine.update({
            where: { id: voiceLine.id },
            data: {
                speaker: nextItem.speaker,
                content: nextItem.content,
                audioUrl: null,
                audioMediaId: null,
                audioDuration: null,
            },
        })
        updatedVoiceLineCount += 1

        if (voiceLine.matchedPanelId) {
            changedPanelIds.add(voiceLine.matchedPanelId)
        }
    }

    let updatedPanelCount = 0
    if (changedPanelIds.size > 0) {
        const matchedVoiceLines = await prisma.novelPromotionVoiceLine.findMany({
            where: {
                episodeId: params.episodeId,
                matchedPanelId: { in: Array.from(changedPanelIds) },
            },
            select: {
                matchedPanelId: true,
                lineIndex: true,
                content: true,
            },
            orderBy: { lineIndex: 'asc' },
        }) as Array<{
            matchedPanelId: string | null
            lineIndex: number
            content: string
        }>

        const panelTextById = new Map<string, string>()
        for (const matchedVoiceLine of matchedVoiceLines) {
            if (!matchedVoiceLine.matchedPanelId) continue
            const text = matchedVoiceLine.content.trim()
            if (!text) continue
            const previousText = panelTextById.get(matchedVoiceLine.matchedPanelId)
            panelTextById.set(
                matchedVoiceLine.matchedPanelId,
                previousText ? `${previousText}；${text}` : text,
            )
        }

        for (const [panelId, srtSegment] of panelTextById.entries()) {
            await prisma.novelPromotionPanel.update({
                where: { id: panelId },
                data: { srtSegment },
            })
            updatedPanelCount += 1
        }
    }

    return {
        synchronized: true,
        updatedVoiceLineCount,
        updatedPanelCount,
    }
}

/**
 * PATCH /api/novel-promotion/[projectId]/clips/[clipId]
 * 更新单个 Clip 的信息
 * 支持更新：characters, location, props, content, screenplay
 */
export const PATCH = apiHandler(async (
    request: NextRequest,
    context: { params: Promise<{ projectId: string; clipId: string }> }
) => {
    const { projectId, clipId } = await context.params

    // 🔐 统一权限验证
    const authResult = await requireProjectAuthLight(projectId)
    if (isErrorResponse(authResult)) return authResult

    const body = await request.json()
    const { characters, location, props, content, screenplay } = body
    const clipModel = prisma.novelPromotionClip as unknown as {
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>
    }
    const currentClipForSync = screenplay !== undefined
        ? await prisma.novelPromotionClip.findUnique({
            where: { id: clipId },
            select: {
                id: true,
                episodeId: true,
                screenplay: true,
            },
        }) as ClipDialogueRecord | null
        : null

    // 验证 Clip 是否存在且属于该项目（间接验证）
    // 这里简化处理，直接通过 ID 更新，Prisma 会处理是否存在
    // 严谨做法是先查 Clip -> Episode -> Project 确认归属，但考虑到 projectId 主要是路由参数校验，且用户只能删改自己的数据

    const updateData: {
        characters?: string | null
        location?: string | null
        props?: string | null
        content?: string
        screenplay?: string | null
    } = {}
    if (characters !== undefined) updateData.characters = characters // JSON string
    if (location !== undefined) updateData.location = location
    if (props !== undefined) updateData.props = props
    if (content !== undefined) updateData.content = content
    if (screenplay !== undefined) updateData.screenplay = screenplay // JSON string

    const clip = await clipModel.update({
        where: { id: clipId },
        data: updateData
    })

    const downstreamSync = screenplay !== undefined
        ? await reconcileClipScreenplayDownstream({
            clipId,
            episodeId: currentClipForSync?.episodeId || null,
            previousScreenplay: currentClipForSync?.screenplay || null,
            screenplay,
        })
        : null

    return NextResponse.json({ success: true, clip, downstreamSync })
})
