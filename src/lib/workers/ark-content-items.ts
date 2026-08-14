import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import type { OrderedVideoReference } from '@/lib/remake-projects/video/contracts'

/**
 * Shared Ark content[] assembly for the Remake video worker handlers.
 *
 * Extracted from the single-shot handler (Plan 09.1-05) so the unit handler
 * (`remake-video-unit.ts`) and the single-shot handler (`remake-video.ts`)
 * build byte-identical content items. Single-shot parity is pinned by the
 * existing `tests/unit/worker/remake-video.test.ts` suite.
 */

export type SignedReference = OrderedVideoReference & { signedUrl: string }

export function isImageReference(ref: OrderedVideoReference): boolean {
  if (ref.mediaType) return ref.mediaType === 'image'
  return ref.role !== 'character_audio_reference'
}

/**
 * Build Ark content[] items from the frozen reference plan:
 *   - images become `image_url` with `role: 'reference_image'` (base64 data URLs);
 *   - audio becomes `audio_url` with `role: 'reference_audio'` (signed URLs).
 * Order matches the snapshot ordinals exactly.
 */
export async function buildArkContentItems(referenceRefs: SignedReference[]) {
  const contentItems: Array<Record<string, unknown>> = []
  for (const ref of referenceRefs) {
    if (isImageReference(ref)) {
      const base64 = await normalizeToBase64ForGeneration(ref.signedUrl)
      contentItems.push({
        type: 'image_url',
        image_url: { url: base64 },
        role: 'reference_image',
      })
    } else {
      contentItems.push({
        type: 'audio_url',
        audio_url: { url: ref.signedUrl },
        role: 'reference_audio',
      })
    }
  }
  return contentItems
}
