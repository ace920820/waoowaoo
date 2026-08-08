/** Deterministic in-memory media fixture for Range/HEAD and authorization tests. */
export type SceneDetectMediaFixture = {
  mediaId: string
  contentType: string
  bytes: Uint8Array
  anchors: { first: number; middle: number; last: number }
}

export function createSceneDetectMediaFixture(size = 4096): SceneDetectMediaFixture {
  const length = Math.max(3, Math.floor(size))
  const bytes = new Uint8Array(length)
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251
  return {
    mediaId: 'fixture-source-media',
    contentType: 'video/mp4',
    bytes,
    anchors: { first: bytes[0], middle: bytes[Math.floor(bytes.length / 2)], last: bytes[bytes.length - 1] },
  }
}

export function createSceneDetectKeyframeFixture(): SceneDetectMediaFixture {
  const fixture = createSceneDetectMediaFixture(3)
  return { ...fixture, mediaId: 'fixture-keyframe-media', contentType: 'image/jpeg' }
}
