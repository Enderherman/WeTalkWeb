export const MAX_ATTACHMENT_SIZE_BYTES = 499 * 1024 * 1024
export const MAX_IMAGE_SIZE_BYTES = 200 * 1024 * 1024

const imageExtensions = new Set(['mjpeg', 'jpeg', 'jpg', 'png', 'gif', 'bmp', 'webp'])
const mediaExtensions = new Set([
  'mp4', 'avi', 'rmvb', 'mkv', 'mp3', 'wma', 'flac', 'aac', 'wav', 'ogg', 'm4a', 'm4b', 'mov',
])

export type ChatFileType = 0 | 1 | 2

export function getChatFileType(fileName: string): ChatFileType {
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase() : ''
  if (imageExtensions.has(extension)) return 0
  if (mediaExtensions.has(extension)) return 1
  return 2
}

export function validateChatFile(file: Pick<File, 'name' | 'size'>): string | null {
  if (!file.name.trim() || file.name.length > 200) {
    return '文件名不能为空，且不能超过 200 个字符'
  }
  if (file.size === 0) return '空文件无法发送'
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) return '普通文件不能超过 500 MB'

  const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : ''
  if (extension && !/^[a-z0-9]{1,16}$/.test(extension)) return '文件扩展名格式不受支持'
  if (getChatFileType(file.name) === 0 && file.size > MAX_IMAGE_SIZE_BYTES) return '图片不能超过 200 MB'
  if (getChatFileType(file.name) === 1) return '视频和音频后续接入'
  return null
}
