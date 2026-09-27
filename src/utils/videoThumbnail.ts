const thumbnailTimeoutMs = 8_000
const maxThumbnailWidth = 640
const maxThumbnailHeight = 360

export async function createVideoCover(
  file: File,
  maxSizeBytes = Number.POSITIVE_INFINITY,
): Promise<File | null> {
  if (maxSizeBytes <= 0 || Number.isNaN(maxSizeBytes)) return null
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return null

  let objectUrl = ''
  const video = document.createElement('video')
  try {
    objectUrl = URL.createObjectURL(file)
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timeout = setTimeout(() => finish(new Error('Video thumbnail timed out.')), thumbnailTimeoutMs)
      const cleanup = () => {
        clearTimeout(timeout)
        video.removeEventListener('loadeddata', handleLoaded)
        video.removeEventListener('error', handleError)
      }
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        cleanup()
        if (error) reject(error)
        else resolve()
      }
      const handleLoaded = () => finish()
      const handleError = () => finish(new Error('Video frame is not supported by this browser.'))
      video.addEventListener('loadeddata', handleLoaded, { once: true })
      video.addEventListener('error', handleError, { once: true })
      try {
        video.src = objectUrl
        video.load()
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) finish()
      } catch {
        finish(new Error('Video frame could not be loaded.'))
      }
    })

    if (!video.videoWidth || !video.videoHeight) return null
    const scale = Math.min(1, maxThumbnailWidth / video.videoWidth, maxThumbnailHeight / video.videoHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const context = canvas.getContext('2d')
    if (!context || typeof canvas.toBlob !== 'function') return null
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob || blob.size > maxSizeBytes) return null
    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'video'
    return new File([blob], `${baseName}-cover.png`, { type: 'image/png' })
  } catch {
    return null
  } finally {
    try {
      video.pause()
      video.removeAttribute('src')
      video.load()
    } catch {}
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}
