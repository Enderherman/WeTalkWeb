<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { chatApi } from '@/api/chat'

const props = withDefaults(defineProps<{
  fileId?: string | number | null
  fallback?: string
  showCover?: boolean
  refreshKey?: string | number
  testId?: string
}>(), {
  fileId: '',
  fallback: '',
  showCover: false,
  refreshKey: '',
  testId: undefined,
})

const imageUrl = ref('')
let requestVersion = 0

async function readImageHeader(blob: Blob): Promise<Uint8Array> {
  const sample = blob.slice(0, 12)
  if (typeof sample.arrayBuffer === 'function') return new Uint8Array(await sample.arrayBuffer())
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result instanceof ArrayBuffer ? new Uint8Array(reader.result) : new Uint8Array())
    reader.onerror = () => reject(reader.error || new Error('Unable to inspect avatar image bytes.'))
    reader.readAsArrayBuffer(sample)
  })
}

async function getImageMimeType(blob: Blob) {
  const bytes = await readImageHeader(blob)
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  const header = String.fromCharCode(...bytes)
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return 'image/gif'
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') return 'image/webp'
  if (header.startsWith('BM')) return 'image/bmp'
  return blob.type && blob.type !== 'application/octet-stream' ? blob.type : 'image/png'
}

function revokeImageUrl() {
  if (!imageUrl.value) return
  URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
}

watch(
  () => [props.fileId, props.showCover, props.refreshKey] as const,
  async ([fileId, showCover]) => {
    const version = ++requestVersion
    revokeImageUrl()
    if (fileId === undefined || fileId === null || String(fileId).trim() === '') return

    try {
      const blob = await chatApi.downloadFile(fileId, showCover)
      if (version !== requestVersion) return
      imageUrl.value = URL.createObjectURL(new Blob([blob], { type: await getImageMimeType(blob) }))
    } catch {
      if (version === requestVersion) revokeImageUrl()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  requestVersion += 1
  revokeImageUrl()
})
</script>

<template>
  <span class="avatar-thumbnail" :data-testid="testId" aria-hidden="true">
    <img v-if="imageUrl" :src="imageUrl" alt="" />
    <span v-else>{{ fallback }}</span>
  </span>
</template>
