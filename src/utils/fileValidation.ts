export const MAX_ATTACHMENT_SIZE_BYTES = 499 * 1024 * 1024

const imageExtensions = new Set(['mjpeg', 'jpeg', 'jpg', 'png', 'gif', 'bmp', 'webp'])
const mediaExtensions = new Set([
  'mp4', 'avi', 'rmvb', 'mkv', 'mp3', 'wma', 'flac', 'aac', 'wav', 'ogg', 'm4a', 'm4b', 'mov',
])

export function validateOrdinaryFile(file: Pick<File, 'name' | 'size'>): string | null {
  if (!file.name.trim() || file.name.length > 200) {
    return '文件名不能为空，且不能超过 200 个字符'
  }
  if (file.size === 0) return '空文件无法发送'
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) return '普通文件不能超过 500 MB'

  const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : ''
  if (extension && !/^[a-z0-9]{1,16}$/.test(extension)) return '文件扩展名格式不受支持'
  if (imageExtensions.has(extension) || mediaExtensions.has(extension)) {
    return '当前先支持普通文件，图片和音视频后续接入'
  }
  return null
}
