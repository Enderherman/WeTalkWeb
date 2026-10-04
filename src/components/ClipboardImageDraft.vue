<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { SystemSettings } from '@/api/systemSettings'
import { validateChatFile } from '@/utils/fileValidation'

const props = defineProps<{ contactId: string; disabled: boolean; settings: SystemSettings }>()
const emit = defineEmits<{ send: [file: File] }>()
const draft = ref<{ file: File; url: string } | null>(null)
const error = ref('')
const extensions: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/webp': 'webp',
}

function clear() {
  if (draft.value) URL.revokeObjectURL(draft.value.url)
  draft.value = null
  error.value = ''
}

function paste(event: ClipboardEvent) {
  const clipboard = event.clipboardData
  if (!clipboard) return
  const itemFiles = Array.from(clipboard.items || []).filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile()).filter((file): file is File => Boolean(file))
  const images = (itemFiles.length ? itemFiles : Array.from(clipboard.files || []))
    .filter((file) => file.type.startsWith('image/'))
  if (!images.length) return
  if (!clipboard.getData('text/plain')) event.preventDefault()
  error.value = ''
  if (!props.contactId || props.disabled) {
    error.value = '当前暂时不能发送图片，请稍后粘贴。'
    return
  }
  if (images.length !== 1) {
    error.value = '请一次粘贴一张图片。'
    return
  }
  const image = images[0]!
  const extension = extensions[image.type]
  if (!extension) {
    error.value = '请粘贴 PNG、JPEG、GIF、BMP 或 WebP 图片。'
    return
  }
  const file = new File([image], `clipboard-${Date.now()}.${extension}`, { type: image.type })
  const validationError = validateChatFile(file, props.settings)
  if (validationError) {
    error.value = validationError
    return
  }
  clear()
  try { draft.value = { file, url: URL.createObjectURL(file) } }
  catch { error.value = '浏览器无法预览此图片，请使用文件选择器上传。' }
}

function send() {
  if (!draft.value || props.disabled) return
  const file = draft.value.file
  clear()
  emit('send', file)
}

watch(() => props.contactId, clear)
onBeforeUnmount(clear)
defineExpose({ paste })
</script>

<template>
  <p v-if="error" class="composer-error" role="alert" data-testid="clipboard-image-error">{{ error }}</p>
  <section v-if="draft" class="clipboard-image-draft" aria-label="待发送图片" data-testid="clipboard-image-draft">
    <img :src="draft.url" alt="粘贴图片预览" />
    <span>图片将发送到当前会话</span>
    <button class="message-search-clear" type="button" :disabled="disabled" data-testid="send-clipboard-image" @click="send">发送图片</button>
    <button class="message-search-clear" type="button" data-testid="cancel-clipboard-image" @click="clear">取消</button>
  </section>
</template>

<style scoped>
.clipboard-image-draft {
  display: flex; width: min(100% - 28px, 720px); flex: 0 0 auto; align-items: center;
  flex-wrap: wrap; gap: 8px; margin: 0 auto 10px; padding: 8px;
  border: 1px solid var(--wt-line); border-radius: 12px; color: var(--wt-text); font-size: 12px;
}
.clipboard-image-draft img { width: 56px; height: 56px; object-fit: contain; border-radius: 6px; }
.clipboard-image-draft span { flex: 1; min-width: 80px; }
</style>
