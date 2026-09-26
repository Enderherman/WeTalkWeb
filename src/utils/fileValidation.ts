export const MAX_ATTACHMENT_SIZE_BYTES = 499 * 1024 * 1024
export const MAX_IMAGE_SIZE_BYTES = 200 * 1024 * 1024

const imageExtensions = new Set(['mjpeg', 'jpeg', 'jpg', 'png', 'gif', 'bmp', 'webp'])
const videoExtensions = new Set(['mp4', 'avi', 'rmvb', 'mkv', 'mov'])
const audioExtensions = new Set(['mp3', 'wma', 'flac', 'aac', 'wav', 'ogg', 'm4a', 'm4b'])

export type ChatFileType = 0 | 1 | 2
export type ChatMediaKind = 'image' | 'video' | 'audio' | 'file'

export interface ChatFileLimits {
  maxImageSize?: number | null
  maxVideoSize?: number | null
  maxFileSize?: number | null
}

export function getChatMediaKind(fileName: string): ChatMediaKind {
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase() : ''
  if (imageExtensions.has(extension)) return 'image'
  if (videoExtensions.has(extension)) return 'video'
  if (audioExtensions.has(extension)) return 'audio'
  return 'file'
}

export function getChatFileType(fileName: string): ChatFileType {
  const kind = getChatMediaKind(fileName)
  if (kind === 'image') return 0
  if (kind === 'video' || kind === 'audio') return 1
  return 2
}

export function getChatMediaMimeType(fileName: string): string | null {
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase() : ''
  const mimeTypes: Record<string, string> = {
    mjpeg: 'image/jpeg',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    mp4: 'video/mp4',
    avi: 'video/x-msvideo',
    rmvb: 'video/vnd.rn-realvideo',
    mkv: 'video/x-matroska',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wma: 'audio/x-ms-wma',
    flac: 'audio/flac',
    aac: 'audio/aac',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    m4b: 'audio/mp4',
  }
  return mimeTypes[extension] || null
}

export function validateChatFile(file: Pick<File, 'name' | 'size'>, limits: ChatFileLimits = {}): string | null {
  if (!file.name.trim() || file.name.length > 200) {
    return '文件名不能为空，且不能超过 200 个字符'
  }
  if (file.size === 0) return '空文件无法发送'
  const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : ''
  if (extension && !/^[a-z0-9]{1,16}$/.test(extension)) return '文件扩展名格式不受支持'
  const fileType = getChatFileType(file.name)
  const configValue = fileType === 0 ? limits.maxImageSize : fileType === 1 ? limits.maxVideoSize : limits.maxFileSize
  const defaultLimitMb = fileType === 0 ? 200 : fileType === 1 ? 500 : 5000
  const parsedLimit = Number(configValue)
  const configuredLimitMb = Number.isSafeInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : defaultLimitMb
  const hardLimitBytes = fileType === 0 ? MAX_IMAGE_SIZE_BYTES : MAX_ATTACHMENT_SIZE_BYTES
  const effectiveLimitBytes = Math.min(configuredLimitMb * 1024 * 1024, hardLimitBytes)
  if (file.size > effectiveLimitBytes) {
    const kind = fileType === 0 ? '图片' : fileType === 1 ? '音视频文件' : '普通文件'
    const hardLimitMb = fileType === 0 ? 200 : 500
    const displayedLimit = configuredLimitMb * 1024 * 1024 <= hardLimitBytes ? configuredLimitMb : hardLimitMb
    return `${kind}不能超过 ${displayedLimit} MB`
  }
  return null
}
