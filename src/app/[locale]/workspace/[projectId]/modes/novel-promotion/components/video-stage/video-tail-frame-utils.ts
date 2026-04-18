'use client'

function waitForEvent(target: HTMLVideoElement, eventName: keyof HTMLMediaElementEventMap) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(eventName, handleSuccess)
      target.removeEventListener('error', handleError)
    }

    const handleSuccess = () => {
      cleanup()
      resolve()
    }

    const handleError = () => {
      cleanup()
      reject(new Error('视频加载失败，无法提取尾帧'))
    }

    target.addEventListener(eventName, handleSuccess, { once: true })
    target.addEventListener('error', handleError, { once: true })
  })
}

export async function extractVideoTailFrame(videoUrl: string): Promise<File> {
  const response = await fetch(videoUrl)
  if (!response.ok) {
    throw new Error('视频下载失败，无法提取尾帧')
  }

  const videoBlob = await response.blob()
  const objectUrl = URL.createObjectURL(videoBlob)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.src = objectUrl

  try {
    await waitForEvent(video, 'loadedmetadata')

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
    video.currentTime = duration > 0.05 ? duration - 0.05 : 0
    await waitForEvent(video, 'seeked')

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('浏览器无法创建画布，无法提取尾帧')
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })

    if (!imageBlob) {
      throw new Error('尾帧导出失败')
    }

    return new File([imageBlob], `tail-frame-${Date.now()}.png`, { type: 'image/png' })
  } finally {
    URL.revokeObjectURL(objectUrl)
    video.removeAttribute('src')
    video.load()
  }
}

export function downloadFileFromUrl(url: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}
