export const executorHealth = () => ({ status: 'ok' as const })

export const executorAnalyzeResponse = (overrides: Record<string, unknown> = {}) => ({
  analysisId: 'analysis-fixture',
  metadata: { name: 'source.mp4', size: 4, duration: 2, fps: 2, width: 320, height: 180, totalFrames: 4, isSample: false },
  shots: [{ shotNumber: 1, startFrame: 0, endFrame: 3, middleFrame: 1, rawStartFrame: 0, rawEndFrame: 3, startTimecode: '00:00:00.000', middleTimecode: '00:00:00.500', endTimecode: '00:00:01.500', duration: 2, durationFrames: 4, firstFrameUrl: '/media/a/first.jpg', middleFrameUrl: '/media/a/middle.jpg', lastFrameUrl: '/media/a/last.jpg', keyframeFrames: { first: 0, middle: 1, last: 3 }, keyframeSource: 'AI', status: 'pending', modifiedSource: 'AI', tags: [], notes: 'fixture', confidence: null }], detector: 'content', threshold: 27, ...overrides,
})

export const executorKeyframesResponse = (overrides: Record<string, unknown> = {}) => ({ ...executorAnalyzeResponse(), ...overrides })
