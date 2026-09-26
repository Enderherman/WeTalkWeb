export const MAX_PROFILE_IMAGE_SIZE_BYTES = 10 * 1024 * 1024

const supportedImageTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
}

export function validateProfileImageUpload(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : ''
  if (!supportedImageTypes[extension] || file.type !== supportedImageTypes[extension]) {
    return '头像和封面需使用 PNG、JPEG、GIF、BMP 或 WebP 图片'
  }
  if (file.size === 0 || file.size > MAX_PROFILE_IMAGE_SIZE_BYTES) {
    return '头像或封面不能为空，且不能超过 10 MiB'
  }
  return null
}
